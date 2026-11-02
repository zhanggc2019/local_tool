import { PDFExportService } from '../../../bindings/example.com/pdf-desktop';
import { convertPDF, estimateLayout, loadPDF, renderPreview, type LoadedPDF, type ConversionOptions } from './converter';
import type { ExportMode, ImageFormat } from './layout';
import { chooseSources, readSource } from '../source-file';
import type { LocalSource } from '../../../bindings/example.com/pdf-desktop';

let currentPDF: LoadedPDF | null = null;
let selectedSources: LocalSource[] = [];
let busy = false;
let selecting = false;

/** Returns a required element with a useful startup error if markup is incomplete. */
function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`缺少界面元素：${id}`);
  return found as T;
}

/** Reads the selected width, page mode, and format as one immutable snapshot. */
function readOptions(): ConversionOptions {
  const selected = (name: string): string => {
    const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
    if (!input) throw new Error('导出设置不完整');
    return input.value;
  };
  return { width: Number(selected('size')), mode: selected('mode') as ExportMode, format: selected('format') as ImageFormat };
}

/** Updates selected option cards to mirror their radio inputs. */
function refreshChoices(): void {
  document.querySelectorAll<HTMLElement>('.choice,.mode-choice,.format-choice').forEach((label) => {
    label.classList.toggle('selected', Boolean(label.querySelector<HTMLInputElement>('input')?.checked));
  });
}

/** Shows an actionable error without losing the selected PDF. */
function showError(message: string): void {
  const box = element<HTMLDivElement>('error');
  box.textContent = message;
  box.hidden = false;
}

/** Hides a previous error when the user changes a setting or starts again. */
function clearError(): void {
  element<HTMLDivElement>('error').hidden = true;
}

/** Converts an unknown JavaScript or Wails error into readable text. */
function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '操作失败，请重试';
}

/** Formats tiny PDFs in KB and larger PDFs in MB. */
function fileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** Displays bounded output dimensions before starting a conversion. */
function updateEstimate(): void {
  const text = element<HTMLSpanElement>('estimateText');
  const box = element<HTMLDivElement>('estimate');
  const button = element<HTMLButtonElement>('convertButton');
  box.classList.remove('warning');
  if (!currentPDF || !selectedSources.length) {
    text.textContent = '选择 PDF 后显示预计尺寸';
    button.disabled = true;
    return;
  }
  try {
    const options = readOptions();
    const layout = estimateLayout(currentPDF, options);
    const reduced = layout.width < options.width;
    box.classList.toggle('warning', reduced);
    text.textContent = options.mode === 'single'
      ? `预计 ${layout.width} × ${layout.height} px${reduced ? ' · 已自动缩小，控制长图体积' : ''}`
      : `${currentPDF.sizes.length} 张图片 · 宽 ${layout.width} px${reduced ? ' · 已自动缩小' : ''}`;
    button.disabled = busy;
  } catch (error) {
    box.classList.add('warning');
    text.textContent = errorText(error);
    button.disabled = true;
  }
}

/** Shows the file name, page count, file size, and first-page preview. */
async function chooseFile(file: File): Promise<boolean> {
  if (busy) return false;
  clearError();
  element<HTMLDivElement>('result').hidden = true;
  const button = element<HTMLButtonElement>('convertButton');
  button.disabled = true;
  button.textContent = '正在读取 PDF…';
  let next: LoadedPDF | null = null;
  try {
    next = await loadPDF(file);
    await renderPreview(next, element<HTMLCanvasElement>('previewCanvas'));
    if (currentPDF) await currentPDF.document.destroy();
    currentPDF = next;
    element<HTMLDivElement>('emptyState').hidden = true;
    element<HTMLDivElement>('loadedState').hidden = false;
    element<HTMLElement>('fileName').textContent = next.name;
    element<HTMLElement>('fileMeta').textContent = `${next.sizes.length} 页 · ${fileSize(next.bytes)}`;
    return true;
  } catch (error) {
    if (next) await next.document.destroy();
    showError(`读取 PDF 失败：${errorText(error)}`);
    return false;
  } finally {
    button.textContent = '开始转换';
    updateEstimate();
  }
}

/** Updates the export progress bar after one page has been processed. */
function updateProgress(completed: number, total: number): void {
  const percent = Math.round(completed / total * 100);
  element<HTMLElement>('progressText').textContent = completed < total ? `正在处理第 ${completed} / ${total} 步` : '正在完成导出';
  element<HTMLElement>('progressPercent').textContent = `${percent}%`;
  element<HTMLDivElement>('progressBar').style.width = `${percent}%`;
}

/** Selects native PDF sources and previews the first document. */
async function chooseNativePDFs(): Promise<void> {
  if (busy || selecting) return;
  selecting = true;
  clearError();
  try {
    const picked = await chooseSources('pdf-image', element<HTMLInputElement>('pdfBatch').checked);
    if (!picked?.length) return;
    selectedSources = [];
    element<HTMLDivElement>('pdfQueue').hidden = true;
    updateEstimate();
    const first = await readSource('pdf-image', 0, picked[0]);
    if (!await chooseFile(first)) return;
    selectedSources = picked;
    updateEstimate();
    const summary = element<HTMLDivElement>('pdfQueue');
    summary.textContent = picked.length > 1 ? `已选择 ${picked.length} 个 PDF · 将逐个导出到各自的原文件夹` : `输出默认保存在 ${picked[0].path.replace(/[\\/][^\\/]+$/, '')}`;
    summary.hidden = false;
  } catch (error) { showError(`读取 PDF 失败：${errorText(error)}`); }
  finally { selecting = false; }
}

/** Renders the PDF and writes each image through its Wails export session. */
async function startConversion(): Promise<void> {
  if (!currentPDF || busy || selecting) return;
  clearError();
  element<HTMLDivElement>('result').hidden = true;
  const options = readOptions();
  busy = true;
  updateEstimate();
  try {
    element<HTMLDivElement>('progress').hidden = false;
    let completed = 0;
    let lastLocation = '';
    const failures: string[] = [];
    for (let index = 0; index < selectedSources.length; index++) {
      const source = selectedSources[index];
      let pdf: LoadedPDF | null = index === 0 ? currentPDF : null;
      let token = '';
      try {
        if (!pdf) pdf = await loadPDF(await readSource('pdf-image', index, source));
        const target = await PDFExportService.BeginExportBesideSource(source.path, options.mode, options.format, pdf.sizes.length);
        token = target.token;
        updateProgress(0, options.mode === 'single' ? pdf.sizes.length + 1 : pdf.sizes.length);
        await convertPDF(pdf, options, (number, base64) => PDFExportService.WriteImage(token, number, base64), updateProgress);
        const result = await PDFExportService.FinishExport(token);
        lastLocation = result.location;
        token = '';
        completed++;
      } catch (error) {
        if (token) await PDFExportService.AbortExport(token);
        failures.push(`${source.name}：${errorText(error)}`);
      } finally {
        if (index > 0 && pdf) await pdf.document.destroy();
      }
      element<HTMLElement>('progressText').textContent = `已处理 ${index + 1} / ${selectedSources.length} 个 PDF`;
    }
    element<HTMLElement>('resultTitle').textContent = `转换完成 · ${completed} / ${selectedSources.length} 个 PDF`;
    element<HTMLElement>('resultPath').textContent = selectedSources.length === 1 ? lastLocation : '输出保存在各源 PDF 所在文件夹';
    element<HTMLButtonElement>('openFolder').textContent = selectedSources.length > 1 ? '打开最近结果' : '打开文件夹';
    element<HTMLDivElement>('result').hidden = false;
    if (failures.length) showError(`失败 ${failures.length} 个：${failures.join('；')}`);
  } catch (error) {
    showError(`转换失败：${errorText(error)}`);
  } finally {
    busy = false;
    element<HTMLDivElement>('progress').hidden = true;
    updateEstimate();
  }
}

/** Wires the PDF tool controls after the app shell has been rendered. */
export function setupPdfTool(): void {
  const zone = element<HTMLDivElement>('dropzone');
  zone.addEventListener('click', () => void chooseNativePDFs());
  zone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); zone.click(); } });
  element<HTMLInputElement>('pdfBatch').addEventListener('change', (event) => { const toggle = event.target as HTMLInputElement; if (busy || selecting) { toggle.checked = !toggle.checked; return; } selectedSources = []; if (currentPDF) { void currentPDF.document.destroy(); currentPDF = null; } element<HTMLDivElement>('loadedState').hidden = true; element<HTMLDivElement>('emptyState').hidden = false; element<HTMLDivElement>('pdfQueue').hidden = true; updateEstimate(); });
  document.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach((radio) => {
    radio.addEventListener('change', () => { refreshChoices(); clearError(); updateEstimate(); });
  });
  element<HTMLButtonElement>('convertButton').addEventListener('click', () => void startConversion());
  element<HTMLButtonElement>('openFolder').addEventListener('click', async () => {
    try { await PDFExportService.OpenOutputFolder(); }
    catch (error) { showError(`无法打开文件夹：${errorText(error)}`); }
  });
  updateEstimate();
}
