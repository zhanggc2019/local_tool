import { ImagePDFService, type LocalSource } from '../../../bindings/example.com/pdf-desktop/internal/app';
import { initialOrder, isValidOrder, moveOrderEntry } from './order';

let files: LocalSource[] = [];
let order: number[] = [];

/** Finds one required images-to-PDF element. */
function imagePdfEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少图片转 PDF 界面元素：${id}`);
  return node as T;
}

/** Formats one image size for the ordered list. */
function imagePdfSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Displays one native or validation error using text content only. */
function imagePdfError(error: unknown): void {
  const box = imagePdfEl<HTMLDivElement>('imagePdfError');
  box.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : '合成 PDF 失败';
  box.hidden = false;
}

/** Updates the ordered file list with per-item move buttons. */
function renderImagePdfFiles(): void {
  const list = imagePdfEl<HTMLOListElement>('imagePdfFiles');
  list.replaceChildren();
  order.forEach((fileIndex, position) => {
    const file = files[fileIndex];
    const item = document.createElement('li');
    item.className = 'video-file image-pdf-item';
    const copy = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = file.name;
    name.title = file.path;
    const detail = document.createElement('small');
    detail.textContent = `第 ${position + 1} 页 · ${imagePdfSize(file.bytes)}`;
    copy.append(name, detail);
    const moves = document.createElement('div');
    moves.className = 'image-pdf-moves';
    const up = document.createElement('button');
    up.type = 'button';
    up.textContent = '上移';
    up.disabled = position === 0;
    up.addEventListener('click', () => { order = moveOrderEntry(order, position, position - 1); renderImagePdfFiles(); });
    const down = document.createElement('button');
    down.type = 'button';
    down.textContent = '下移';
    down.disabled = position === order.length - 1;
    down.addEventListener('click', () => { order = moveOrderEntry(order, position, position + 1); renderImagePdfFiles(); });
    moves.append(up, down);
    item.append(copy, moves);
    list.append(item);
  });
  list.hidden = files.length === 0;
  imagePdfEl<HTMLDivElement>('imagePdfEmpty').hidden = files.length > 0;
  imagePdfEl<HTMLButtonElement>('imagePdfRun').disabled = files.length === 0;
}

/** Opens the native selector and stores the picked images in selection order. */
async function chooseImagePdfFiles(): Promise<void> {
  imagePdfEl<HTMLDivElement>('imagePdfError').hidden = true;
  try {
    const selected = await ImagePDFService.ChooseImages(true);
    if (!selected?.length) return;
    files = selected;
    order = initialOrder(files.length);
    imagePdfEl<HTMLDivElement>('imagePdfResult').hidden = true;
    renderImagePdfFiles();
  } catch (error) { imagePdfError(error); }
}

/** Writes one PDF from the ordered images beside the first image. */
async function createImagePDF(): Promise<void> {
  if (!files.length || !isValidOrder(order, files.length)) return;
  const mode = document.querySelector<HTMLInputElement>('input[name="imagePdfMode"]:checked')?.value ?? 'fit';
  const status = imagePdfEl<HTMLDivElement>('imagePdfStatus');
  imagePdfEl<HTMLButtonElement>('imagePdfRun').disabled = true;
  imagePdfEl<HTMLButtonElement>('imagePdfPick').disabled = true;
  imagePdfEl<HTMLDivElement>('imagePdfError').hidden = true;
  status.textContent = '正在合成 PDF…';
  status.hidden = false;
  try {
    const result = await ImagePDFService.CreatePDF(order, mode);
    imagePdfEl<HTMLElement>('imagePdfResultTitle').textContent = `已合成 ${result.count} 页 PDF`;
    imagePdfEl<HTMLElement>('imagePdfResultPath').textContent = result.location;
    imagePdfEl<HTMLDivElement>('imagePdfResult').hidden = false;
  } catch (error) {
    imagePdfError(error);
  } finally {
    status.hidden = true;
    imagePdfEl<HTMLButtonElement>('imagePdfRun').disabled = false;
    imagePdfEl<HTMLButtonElement>('imagePdfPick').disabled = false;
  }
}

/** Wires selection, ordering, page mode, conversion, and folder opening. */
export function setupImagePDFTool(): void {
  imagePdfEl<HTMLButtonElement>('imagePdfPick').addEventListener('click', () => void chooseImagePdfFiles());
  document.querySelectorAll<HTMLInputElement>('input[name="imagePdfMode"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('#imagePdfModes .mode-choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
  }));
  imagePdfEl<HTMLButtonElement>('imagePdfRun').addEventListener('click', () => void createImagePDF());
  imagePdfEl<HTMLButtonElement>('imagePdfOpenFolder').addEventListener('click', async () => {
    try { await ImagePDFService.OpenImagePDFOutputFolder(); }
    catch (error) { imagePdfError(error); }
  });
  renderImagePdfFiles();
}
