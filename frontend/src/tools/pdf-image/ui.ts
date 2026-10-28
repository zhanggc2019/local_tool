import { PDFExportService } from '../../../bindings/example.com/pdf-desktop';
import { convertPDF, estimateLayout, loadPDF, renderPreview, type LoadedPDF, type ConversionOptions } from './converter';
import type { ExportMode, ImageFormat } from './layout';

let currentPDF: LoadedPDF | null = null;
let busy = false;

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
  if (!currentPDF) {
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
async function chooseFile(file: File): Promise<void> {
  if (busy) return;
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
  } catch (error) {
    if (next) await next.document.destroy();
    showError(`读取 PDF 失败：${errorText(error)}`);
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

/** Renders the PDF and writes each image through its Wails export session. */
async function startConversion(): Promise<void> {
  if (!currentPDF || busy) return;
  clearError();
  element<HTMLDivElement>('result').hidden = true;
  const pdf = currentPDF;
  const options = readOptions();
  let token = '';
  busy = true;
  updateEstimate();
  try {
    const target = await PDFExportService.BeginExport(pdf.name, options.mode, options.format, pdf.sizes.length);
    if (!target.token) return;
    token = target.token;
    element<HTMLDivElement>('progress').hidden = false;
    updateProgress(0, options.mode === 'single' ? pdf.sizes.length + 1 : pdf.sizes.length);
    await convertPDF(pdf, options,
      (number, base64) => PDFExportService.WriteImage(token, number, base64),
      updateProgress);
    const result = await PDFExportService.FinishExport(token);
    token = '';
    element<HTMLElement>('resultTitle').textContent = `转换完成 · ${result.count} 张图片`;
    element<HTMLElement>('resultPath').textContent = result.location;
    element<HTMLDivElement>('result').hidden = false;
  } catch (error) {
    if (token) await PDFExportService.AbortExport(token);
    showError(`转换失败：${errorText(error)}`);
  } finally {
    busy = false;
    element<HTMLDivElement>('progress').hidden = true;
    updateEstimate();
  }
}

/** Wires the PDF tool controls after the app shell has been rendered. */
export function setupPdfTool(): void {
  const input = element<HTMLInputElement>('fileInput');
  const zone = element<HTMLDivElement>('dropzone');
  zone.addEventListener('click', () => { if (!busy) { input.value = ''; input.click(); } });
  zone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); zone.click(); } });
  input.addEventListener('change', () => { if (input.files?.[0]) void chooseFile(input.files[0]); });
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
