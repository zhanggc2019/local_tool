import { CutoutService, type LocalSource } from '../../../bindings/example.com/pdf-desktop/internal/app';
import { chooseSources, readSource } from '../source-file';
import {
  compositeBackground,
  cutOutPortrait,
  effectiveFormat,
  encodeCutout,
  isCutoutBackground,
  type CutoutBackground,
  type CutoutFormat,
} from './processor';

let files: LocalSource[] = [];
let portrait: HTMLCanvasElement | null = null;
let busy = false;

/** Finds one required cutout element. */
function cutoutEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少人像抠图界面元素：${id}`);
  return node as T;
}

/** Reads the currently selected background identifier. */
function currentBackground(): CutoutBackground {
  const value = document.querySelector<HTMLInputElement>('input[name="cutoutBackground"]:checked')?.value ?? 'transparent';
  if (!isCutoutBackground(value)) return 'transparent';
  return value;
}

/** Reads the requested output format before transparency handling. */
function requestedFormat(): CutoutFormat {
  return document.querySelector<HTMLInputElement>('input[name="cutoutFormat"]:checked')?.value === 'jpeg' ? 'jpeg' : 'png';
}

/** Displays one native or validation error using text content only. */
function cutoutError(error: unknown): void {
  const box = cutoutEl<HTMLDivElement>('cutoutError');
  box.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : '抠图失败';
  box.hidden = false;
}

/** Updates the visible file queue and enabled controls. */
function renderCutoutFiles(states: Map<number, string> = new Map()): void {
  const list = cutoutEl<HTMLOListElement>('cutoutFiles');
  list.replaceChildren();
  files.forEach((file, index) => {
    const item = document.createElement('li');
    item.className = 'video-file';
    const copy = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = file.name;
    name.title = file.path;
    const detail = document.createElement('small');
    detail.textContent = states.get(index) ?? '等待处理';
    copy.append(name, detail);
    item.append(copy);
    list.append(item);
  });
  list.hidden = files.length === 0;
  cutoutEl<HTMLDivElement>('cutoutEmpty').hidden = files.length > 0;
  const single = files.length === 1 && portrait !== null;
  cutoutEl<HTMLButtonElement>('cutoutRun').disabled = busy || !single;
  cutoutEl<HTMLButtonElement>('cutoutRun').textContent = files.length > 1 ? '开始抠图' : '保存抠图';
}

/** Paints the segmented person with the selected background onto the preview. */
function paintPreview(): void {
  if (!portrait) return;
  const background = currentBackground();
  const composited = compositeBackground(portrait, background);
  const canvas = cutoutEl<HTMLCanvasElement>('cutoutCanvas');
  canvas.width = composited.width;
  canvas.height = composited.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法绘制抠图预览');
  context.drawImage(composited, 0, 0);
  cutoutEl<HTMLDivElement>('cutoutPreview').hidden = false;
  updateFormatAvailability(background);
}

/** Keeps the JPG option consistent with the selected background. */
function updateFormatAvailability(background: CutoutBackground): void {
  const jpeg = document.querySelector<HTMLInputElement>('input[name="cutoutFormat"][value="jpeg"]');
  if (!jpeg) return;
  const forbidden = background === 'transparent';
  jpeg.disabled = forbidden;
  if (forbidden && jpeg.checked) {
    const png = document.querySelector<HTMLInputElement>('input[name="cutoutFormat"][value="png"]');
    if (png) png.checked = true;
    document.querySelectorAll<HTMLElement>('.cutout-formats .format-choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
  }
}

/** Opens the native selector in single or multiple mode. */
async function chooseCutoutImages(): Promise<void> {
  if (busy) return;
  cutoutEl<HTMLDivElement>('cutoutError').hidden = true;
  try {
    const selected = await chooseSources('cutout', cutoutEl<HTMLInputElement>('cutoutBatch').checked);
    if (!selected?.length) return;
    files = selected;
    portrait = null;
    cutoutEl<HTMLDivElement>('cutoutPreview').hidden = true;
    cutoutEl<HTMLDivElement>('cutoutResult').hidden = true;
    if (files.length === 1) {
      await previewSingle();
    } else {
      renderCutoutFiles();
    }
  } catch (error) { cutoutError(error); }
}

/** Segments the only selected image and shows the composed preview. */
async function previewSingle(): Promise<void> {
  const status = cutoutEl<HTMLDivElement>('cutoutStatus');
  busy = true;
  renderCutoutFiles();
  status.textContent = '正在识别人像…';
  status.hidden = false;
  try {
    const file = await readSource('cutout', 0, files[0]);
    portrait = await cutOutPortrait(file);
    paintPreview();
    renderCutoutFiles(new Map([[0, '已识别，可保存']]));
  } catch (error) {
    portrait = null;
    renderCutoutFiles(new Map([[0, '失败']]));
    cutoutError(error);
  } finally {
    status.hidden = true;
    busy = false;
    renderCutoutFiles(new Map(portrait ? [[0, '已识别，可保存']] : []));
  }
}

/** Saves the single cutout or processes every selected image in order. */
async function runCutout(): Promise<void> {
  if (busy || !files.length) return;
  if (files.length === 1 && portrait) {
    await saveSingle();
    return;
  }
  await processBatch();
}

/** Encodes and saves the already segmented single image. */
async function saveSingle(): Promise<void> {
  if (!portrait) return;
  const background = currentBackground();
  const format = effectiveFormat(background, requestedFormat());
  busy = true;
  cutoutEl<HTMLButtonElement>('cutoutPick').disabled = true;
  try {
    const encoded = encodeCutout(compositeBackground(portrait, background), format);
    const path = await CutoutService.SaveCutoutBesideSource(files[0].path, format, encoded);
    cutoutEl<HTMLElement>('cutoutResultTitle').textContent = '抠图已保存';
    cutoutEl<HTMLElement>('cutoutResultPath').textContent = path;
    cutoutEl<HTMLDivElement>('cutoutResult').hidden = false;
  } catch (error) {
    cutoutError(error);
  } finally {
    busy = false;
    cutoutEl<HTMLButtonElement>('cutoutPick').disabled = false;
    renderCutoutFiles(new Map([[0, '已识别，可保存']]));
  }
}

/** Segments and saves every selected image beside its source. */
async function processBatch(): Promise<void> {
  busy = true;
  cutoutEl<HTMLButtonElement>('cutoutPick').disabled = true;
  cutoutEl<HTMLInputElement>('cutoutBatch').disabled = true;
  cutoutEl<HTMLDivElement>('cutoutError').hidden = true;
  cutoutEl<HTMLDivElement>('cutoutResult').hidden = true;
  const status = cutoutEl<HTMLDivElement>('cutoutStatus');
  const background = currentBackground();
  const format = effectiveFormat(background, requestedFormat());
  const states = new Map<number, string>();
  const failures: string[] = [];
  let successes = 0;
  try {
    for (let index = 0; index < files.length; index++) {
      status.textContent = `正在处理 ${index + 1} / ${files.length}：${files[index].name}`;
      status.hidden = false;
      states.set(index, '处理中…');
      renderCutoutFiles(states);
      try {
        const file = await readSource('cutout', index, files[index]);
        const cutout = await cutOutPortrait(file);
        const encoded = encodeCutout(compositeBackground(cutout, background), format);
        await CutoutService.SaveCutoutBesideSource(files[index].path, format, encoded);
        successes++;
        states.set(index, '已保存');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        states.set(index, `失败：${message}`);
        failures.push(`${files[index].name}：${message}`);
      }
      renderCutoutFiles(states);
    }
    if (successes) {
      cutoutEl<HTMLElement>('cutoutResultTitle').textContent = `已完成 ${successes} / ${files.length} 张`;
      cutoutEl<HTMLElement>('cutoutResultPath').textContent = '结果保存在各图片所在文件夹';
      cutoutEl<HTMLDivElement>('cutoutResult').hidden = false;
    }
    if (failures.length) cutoutError(`未完成 ${failures.length} 张：${failures.join('；')}`);
  } finally {
    busy = false;
    status.hidden = true;
    cutoutEl<HTMLButtonElement>('cutoutPick').disabled = false;
    cutoutEl<HTMLInputElement>('cutoutBatch').disabled = false;
    renderCutoutFiles(states);
  }
}

/** Wires selection, background, format, saving, and folder opening. */
export function setupCutoutTool(): void {
  cutoutEl<HTMLButtonElement>('cutoutPick').addEventListener('click', () => void chooseCutoutImages());
  cutoutEl<HTMLInputElement>('cutoutBatch').addEventListener('change', () => {
    files = [];
    portrait = null;
    cutoutEl<HTMLDivElement>('cutoutPreview').hidden = true;
    cutoutEl<HTMLDivElement>('cutoutResult').hidden = true;
    cutoutEl<HTMLDivElement>('cutoutError').hidden = true;
    cutoutEl<HTMLButtonElement>('cutoutPick').textContent = cutoutEl<HTMLInputElement>('cutoutBatch').checked ? '选择多张图片' : '选择图片';
    renderCutoutFiles();
  });
  document.querySelectorAll<HTMLInputElement>('input[name="cutoutBackground"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('#cutoutBackgrounds .choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
    const background = currentBackground();
    updateFormatAvailability(background);
    if (portrait) paintPreview();
  }));
  document.querySelectorAll<HTMLInputElement>('input[name="cutoutFormat"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('.cutout-formats .format-choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
  }));
  cutoutEl<HTMLButtonElement>('cutoutRun').addEventListener('click', () => void runCutout());
  cutoutEl<HTMLButtonElement>('cutoutOpenFolder').addEventListener('click', async () => {
    try { await CutoutService.OpenCutoutOutputFolder(); }
    catch (error) { cutoutError(error); }
  });
  renderCutoutFiles();
}
