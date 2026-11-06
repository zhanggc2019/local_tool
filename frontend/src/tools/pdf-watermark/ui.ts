import { PDFWatermarkService, type PDFSource } from '../../../bindings/example.com/pdf-desktop/internal/app';
import { clampInt, describeWatermark } from './options';

let source: PDFSource | null = null;
let busy = false;

/** Finds one required PDF watermark element. */
function wmEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少 PDF 水印界面元素：${id}`);
  return node as T;
}

/** Displays one native or validation error using text content only. */
function wmError(error: unknown): void {
  const box = wmEl<HTMLDivElement>('wmError');
  box.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : '添加水印失败';
  box.hidden = false;
}

/** Reads the current color swatch value. */
function currentColor(): string {
  return document.querySelector<HTMLInputElement>('input[name="wmColor"]:checked')?.value ?? '#808080';
}

/** Reads and clamps every appearance control. */
function readAppearance(): { text: string; fontSize: number; opacity: number; rotation: number; color: string; onTop: boolean } {
  return {
    text: wmEl<HTMLInputElement>('wmText').value,
    fontSize: clampInt(Number(wmEl<HTMLInputElement>('wmSize').value), 12, 96),
    opacity: clampInt(Number(wmEl<HTMLInputElement>('wmOpacity').value), 5, 100),
    rotation: clampInt(Number(wmEl<HTMLInputElement>('wmRotation').value), -90, 90),
    color: currentColor(),
    onTop: wmEl<HTMLInputElement>('wmOnTop').checked,
  };
}

/** Refreshes sliders, hint line, and enabled state. */
function renderWatermarkControls(): void {
  const appearance = readAppearance();
  wmEl<HTMLElement>('wmSizeValue').textContent = `${appearance.fontSize} pt`;
  wmEl<HTMLElement>('wmOpacityValue').textContent = `${appearance.opacity}%`;
  wmEl<HTMLElement>('wmRotationValue').textContent = `${appearance.rotation}°`;
  wmEl<HTMLDivElement>('wmHint').textContent = `${describeWatermark(appearance.text, appearance.fontSize, appearance.opacity, appearance.rotation)} · ${appearance.color} · ${appearance.onTop ? '内容上方' : '内容下方'}`;
  wmEl<HTMLButtonElement>('wmRun').disabled = busy || source === null || !appearance.text.trim();
}

/** Shows the selected PDF. */
function renderWatermarkFile(): void {
  const card = wmEl<HTMLDivElement>('wmFile');
  card.replaceChildren();
  if (!source) {
    card.hidden = true;
  } else {
    const name = document.createElement('strong');
    name.textContent = source.name;
    const detail = document.createElement('small');
    detail.textContent = `共 ${source.pages} 页 · 水印将应用到全部页面`;
    card.append(name, detail);
    card.hidden = false;
  }
  wmEl<HTMLDivElement>('wmEmpty').hidden = source !== null;
  renderWatermarkControls();
}

/** Opens the native selector for one PDF. */
async function chooseWatermarkPDF(): Promise<void> {
  if (busy) return;
  wmEl<HTMLDivElement>('wmError').hidden = true;
  try {
    const selected = await PDFWatermarkService.ChoosePDF();
    if (!selected) return;
    source = selected;
    wmEl<HTMLDivElement>('wmResult').hidden = true;
    renderWatermarkFile();
  } catch (error) { wmError(error); }
}

/** Applies the watermark and reports the saved path. */
async function addWatermark(): Promise<void> {
  if (busy || !source) return;
  const appearance = readAppearance();
  if (!appearance.text.trim()) {
    wmError('请输入水印文字');
    return;
  }
  busy = true;
  renderWatermarkFile();
  wmEl<HTMLDivElement>('wmError').hidden = true;
  wmEl<HTMLDivElement>('wmResult').hidden = true;
  const status = wmEl<HTMLDivElement>('wmStatus');
  status.textContent = '正在添加水印…';
  status.hidden = false;
  try {
    const result = await PDFWatermarkService.AddWatermark(
      appearance.text.trim(), appearance.fontSize, appearance.opacity, appearance.rotation, appearance.color, appearance.onTop,
    );
    wmEl<HTMLElement>('wmResultTitle').textContent = `已为 ${result.count} 页添加水印`;
    wmEl<HTMLElement>('wmResultPath').textContent = result.location;
    wmEl<HTMLDivElement>('wmResult').hidden = false;
  } catch (error) {
    wmError(error);
  } finally {
    busy = false;
    status.hidden = true;
    renderWatermarkFile();
  }
}

/** Wires selection, appearance controls, and folder opening. */
export function setupPDFWatermarkTool(): void {
  wmEl<HTMLButtonElement>('wmPick').addEventListener('click', () => void chooseWatermarkPDF());
  for (const id of ['wmText', 'wmSize', 'wmOpacity', 'wmRotation', 'wmOnTop']) {
    wmEl<HTMLInputElement>(id).addEventListener('input', renderWatermarkControls);
    wmEl<HTMLInputElement>(id).addEventListener('change', renderWatermarkControls);
  }
  document.querySelectorAll<HTMLInputElement>('input[name="wmColor"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('#wmColors .swatch').forEach((swatch) => swatch.classList.toggle('selected', Boolean(swatch.querySelector<HTMLInputElement>('input')?.checked)));
    renderWatermarkControls();
  }));
  wmEl<HTMLButtonElement>('wmRun').addEventListener('click', () => void addWatermark());
  wmEl<HTMLButtonElement>('wmOpenFolder').addEventListener('click', async () => {
    try { await PDFWatermarkService.OpenPDFWatermarkOutputFolder(); }
    catch (error) { wmError(error); }
  });
  renderWatermarkFile();
}
