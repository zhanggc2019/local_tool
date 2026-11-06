import { GeneratedImageService, type LocalSource } from '../../../bindings/example.com/pdf-desktop/internal/app';
import { chooseSources, readSource } from '../source-file';
import { clampNumber, encodeStamp, isStampAnchor, renderStamp, type StampAnchor, type StampFormat, type StampOptions } from './processor';

let files: LocalSource[] = [];
let previewSource: ImageBitmap | null = null;
let busy = false;

/** Finds one required image watermark element. */
function stampEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少图片加水印界面元素：${id}`);
  return node as T;
}

/** Displays one native or validation error using text content only. */
function stampError(error: unknown): void {
  const box = stampEl<HTMLDivElement>('stampError');
  box.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : '添加水印失败';
  box.hidden = false;
}

/** Reads the current anchor, honoring the tile checkbox. */
function currentAnchor(): StampAnchor {
  if (stampEl<HTMLInputElement>('stampTile').checked) return 'tile';
  const value = document.querySelector<HTMLInputElement>('input[name="stampAnchor"]:checked')?.value ?? 'br';
  return isStampAnchor(value) && value !== 'tile' ? value : 'br';
}

/** Reads the current output format. */
function currentFormat(): StampFormat {
  return document.querySelector<HTMLInputElement>('input[name="stampFormat"]:checked')?.value === 'jpeg' ? 'jpeg' : 'png';
}

/** Reads every watermark option from the interface. */
function readOptions(): StampOptions {
  return {
    text: stampEl<HTMLInputElement>('stampText').value,
    size: clampNumber(Number(stampEl<HTMLInputElement>('stampSize').value), 12, 160),
    opacity: clampNumber(Number(stampEl<HTMLInputElement>('stampOpacity').value), 5, 100),
    color: document.querySelector<HTMLInputElement>('input[name="stampColor"]:checked')?.value ?? '#ffffff',
    anchor: currentAnchor(),
    format: currentFormat(),
  };
}

/** Updates slider labels and redraws the preview with the current options. */
function renderStampControls(): void {
  const options = readOptions();
  stampEl<HTMLElement>('stampSizeValue').textContent = `${options.size} px`;
  stampEl<HTMLElement>('stampOpacityValue').textContent = `${options.opacity}%`;
  stampEl<HTMLButtonElement>('stampRun').disabled = busy || !files.length || !options.text.trim();
  if (previewSource) drawPreview(options);
}

/** Draws a scaled-down preview of the first image with the watermark applied. */
function drawPreview(options: StampOptions): void {
  if (!previewSource) return;
  const canvas = stampEl<HTMLCanvasElement>('stampPreview');
  const context = canvas.getContext('2d');
  if (!context) return;
  const preview = renderStamp(previewSource, options);
  const scale = Math.min(1, 720 / Math.max(preview.width, preview.height));
  canvas.width = Math.max(1, Math.round(preview.width * scale));
  canvas.height = Math.max(1, Math.round(preview.height * scale));
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(preview, 0, 0, canvas.width, canvas.height);
}

/** Loads the first selected image for preview and updates the file list. */
async function loadPreview(states: Map<number, string> = new Map()): Promise<void> {
  if (previewSource) {
    previewSource.close();
    previewSource = null;
  }
  stampEl<HTMLDivElement>('stampPreviewWrap').hidden = true;
  if (!files.length) return;
  try {
    const file = await readSource('stamp', 0, files[0]);
    previewSource = await createImageBitmap(file);
    stampEl<HTMLDivElement>('stampPreviewWrap').hidden = false;
    renderStampControls();
  } catch {
    // A preview failure must not block batch processing.
  }
  renderStampFiles(states);
}

/** Updates the visible file queue and enabled controls. */
function renderStampFiles(states: Map<number, string> = new Map()): void {
  const list = stampEl<HTMLOListElement>('stampFiles');
  list.replaceChildren();
  files.forEach((file, index) => {
    const item = document.createElement('li');
    item.className = 'video-file';
    const copy = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = file.name;
    name.title = file.path;
    const detail = document.createElement('small');
    detail.textContent = states.get(index) ?? (index === 0 ? '预览图 · 等待处理' : '等待处理');
    copy.append(name, detail);
    item.append(copy);
    list.append(item);
  });
  list.hidden = files.length === 0;
  stampEl<HTMLDivElement>('stampEmpty').hidden = files.length > 0;
  stampEl<HTMLButtonElement>('stampRun').disabled = busy || !files.length || !readOptions().text.trim();
}

/** Opens the native selector in single or multiple mode. */
async function chooseStampImages(): Promise<void> {
  if (busy) return;
  stampEl<HTMLDivElement>('stampError').hidden = true;
  try {
    const selected = await chooseSources('stamp', stampEl<HTMLInputElement>('stampBatch').checked);
    if (!selected?.length) return;
    files = selected;
    stampEl<HTMLDivElement>('stampResult').hidden = true;
    await loadPreview();
  } catch (error) { stampError(error); }
}

/** Applies the watermark to every selected image beside its source. */
async function runStamp(): Promise<void> {
  if (busy || !files.length) return;
  const options = readOptions();
  if (!options.text.trim()) {
    stampError('请输入水印文字');
    return;
  }
  busy = true;
  stampEl<HTMLButtonElement>('stampPick').disabled = true;
  stampEl<HTMLInputElement>('stampBatch').disabled = true;
  stampEl<HTMLDivElement>('stampError').hidden = true;
  stampEl<HTMLDivElement>('stampResult').hidden = true;
  const status = stampEl<HTMLDivElement>('stampStatus');
  const states = new Map<number, string>();
  const failures: string[] = [];
  let successes = 0;
  let lastPath = '';
  try {
    for (let index = 0; index < files.length; index++) {
      status.textContent = `正在处理 ${index + 1} / ${files.length}：${files[index].name}`;
      status.hidden = false;
      states.set(index, '处理中…');
      renderStampFiles(states);
      try {
        const file = await readSource('stamp', index, files[index]);
        const bitmap = await createImageBitmap(file);
        try {
          const canvas = renderStamp(bitmap, options);
          const encoded = encodeStamp(canvas, options.format);
          lastPath = await GeneratedImageService.SaveGeneratedBesideSource(files[index].path, 'watermark', options.format, encoded);
          successes++;
          states.set(index, '已保存');
        } finally {
          bitmap.close();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        states.set(index, `失败：${message}`);
        failures.push(`${files[index].name}：${message}`);
      }
      renderStampFiles(states);
    }
    if (successes) {
      stampEl<HTMLElement>('stampResultTitle').textContent = `已处理 ${successes} / ${files.length} 张`;
      stampEl<HTMLElement>('stampResultPath').textContent = files.length === 1 ? lastPath : '结果保存在各图片所在文件夹';
      stampEl<HTMLDivElement>('stampResult').hidden = false;
    }
    if (failures.length) stampError(`未完成 ${failures.length} 张：${failures.join('；')}`);
  } finally {
    busy = false;
    status.hidden = true;
    stampEl<HTMLButtonElement>('stampPick').disabled = false;
    stampEl<HTMLInputElement>('stampBatch').disabled = false;
    renderStampFiles(states);
  }
}

/** Wires selection, appearance controls, preview, and folder opening. */
export function setupImageStampTool(): void {
  stampEl<HTMLButtonElement>('stampPick').addEventListener('click', () => void chooseStampImages());
  stampEl<HTMLInputElement>('stampBatch').addEventListener('change', () => {
    files = [];
    stampEl<HTMLDivElement>('stampResult').hidden = true;
    stampEl<HTMLDivElement>('stampError').hidden = true;
    stampEl<HTMLDivElement>('stampPreviewWrap').hidden = true;
    stampEl<HTMLButtonElement>('stampPick').textContent = stampEl<HTMLInputElement>('stampBatch').checked ? '选择多张图片' : '选择图片';
    renderStampFiles();
  });
  for (const id of ['stampText', 'stampSize', 'stampOpacity']) {
    stampEl<HTMLInputElement>(id).addEventListener('input', renderStampControls);
  }
  stampEl<HTMLInputElement>('stampTile').addEventListener('change', () => {
    document.querySelectorAll<HTMLInputElement>('input[name="stampAnchor"]').forEach((radio) => { radio.disabled = stampEl<HTMLInputElement>('stampTile').checked; });
    renderStampControls();
  });
  document.querySelectorAll<HTMLInputElement>('input[name="stampAnchor"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('.stamp-anchor').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
    renderStampControls();
  }));
  document.querySelectorAll<HTMLInputElement>('input[name="stampColor"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('#stampColors .swatch').forEach((swatch) => swatch.classList.toggle('selected', Boolean(swatch.querySelector<HTMLInputElement>('input')?.checked)));
    renderStampControls();
  }));
  document.querySelectorAll<HTMLInputElement>('input[name="stampFormat"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('#stampFormats .format-choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
    renderStampControls();
  }));
  stampEl<HTMLButtonElement>('stampRun').addEventListener('click', () => void runStamp());
  stampEl<HTMLButtonElement>('stampOpenFolder').addEventListener('click', async () => {
    try { await GeneratedImageService.OpenGeneratedOutputFolder(); }
    catch (error) { stampError(error); }
  });
  renderStampFiles();
}
