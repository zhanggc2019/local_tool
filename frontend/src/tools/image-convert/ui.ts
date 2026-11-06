import { ImageConvertService, type LocalSource } from '../../../bindings/example.com/pdf-desktop/internal/app';
import { describeChange, formatSize } from '../shared/format';
import { isImageFormat, type ImageOutputFormat } from './options';

let files: LocalSource[] = [];
let busy = false;

/** Finds one required image conversion element. */
function convertEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少图片转换界面元素：${id}`);
  return node as T;
}

/** Displays one native or validation error using text content only. */
function convertError(error: unknown): void {
  const box = convertEl<HTMLDivElement>('imgConvertError');
  box.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : '图片转换失败';
  box.hidden = false;
}

/** Reads the current output format. */
function currentFormat(): ImageOutputFormat {
  const value = document.querySelector<HTMLInputElement>('input[name="imgFormat"]:checked')?.value ?? 'jpeg';
  return isImageFormat(value) ? value : 'jpeg';
}

/** Keeps the quality slider enabled only for JPG output. */
function updateQualityAvailability(): void {
  const isPNG = currentFormat() === 'png';
  convertEl<HTMLElement>('imgConvertQualityBlock').hidden = isPNG;
}

/** Updates the visible file queue and enabled controls. */
function renderConvertFiles(states: Map<number, string> = new Map()): void {
  const list = convertEl<HTMLOListElement>('imgConvertFiles');
  list.replaceChildren();
  files.forEach((file, index) => {
    const item = document.createElement('li');
    item.className = 'video-file';
    const copy = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = file.name;
    name.title = file.path;
    const detail = document.createElement('small');
    detail.textContent = `${formatSize(file.bytes)} · ${states.get(index) ?? '等待转换'}`;
    copy.append(name, detail);
    item.append(copy);
    list.append(item);
  });
  list.hidden = files.length === 0;
  convertEl<HTMLDivElement>('imgConvertEmpty').hidden = files.length > 0;
  convertEl<HTMLButtonElement>('imgConvertRun').disabled = busy || !files.length;
}

/** Opens the native selector in single or multiple mode. */
async function chooseConvertFiles(): Promise<void> {
  if (busy) return;
  convertEl<HTMLDivElement>('imgConvertError').hidden = true;
  try {
    const selected = await ImageConvertService.ChooseImages(convertEl<HTMLInputElement>('imgConvertBatch').checked);
    if (!selected?.length) return;
    files = selected;
    convertEl<HTMLDivElement>('imgConvertResult').hidden = true;
    renderConvertFiles();
  } catch (error) { convertError(error); }
}

/** Converts selected images sequentially so one failure does not stop the batch. */
async function convertImages(): Promise<void> {
  if (busy || !files.length) return;
  const format = currentFormat();
  const quality = Number(convertEl<HTMLInputElement>('imgConvertQuality').value || 90);
  const maxDimension = Number(document.querySelector<HTMLInputElement>('input[name="imgMaxDimension"]:checked')?.value ?? 0);
  busy = true;
  convertEl<HTMLButtonElement>('imgConvertPick').disabled = true;
  convertEl<HTMLInputElement>('imgConvertBatch').disabled = true;
  convertEl<HTMLDivElement>('imgConvertError').hidden = true;
  convertEl<HTMLDivElement>('imgConvertResult').hidden = true;
  const status = convertEl<HTMLDivElement>('imgConvertStatus');
  const states = new Map<number, string>();
  const failures: string[] = [];
  let successes = 0;
  let lastInputBytes = 0;
  let lastOutputBytes = 0;
  let lastPath = '';
  try {
    for (let index = 0; index < files.length; index++) {
      status.textContent = `正在转换 ${index + 1} / ${files.length}：${files[index].name}`;
      status.hidden = false;
      states.set(index, '处理中…');
      renderConvertFiles(states);
      try {
        const result = await ImageConvertService.ConvertImage(index, format, quality, maxDimension);
        successes++;
        lastInputBytes = result.inputBytes;
        lastOutputBytes = result.bytes;
        lastPath = result.path;
        states.set(index, `${describeChange(result.inputBytes, result.bytes)} · ${result.width}×${result.height}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        states.set(index, `失败：${message}`);
        failures.push(`${files[index].name}：${message}`);
      }
      renderConvertFiles(states);
    }
    if (successes) {
      convertEl<HTMLElement>('imgConvertResultTitle').textContent = `已转换 ${successes} / ${files.length} 张`;
      convertEl<HTMLElement>('imgConvertResultPath').textContent = files.length === 1
        ? `${describeChange(lastInputBytes, lastOutputBytes)} · ${lastPath}`
        : '结果保存在各图片所在文件夹';
      convertEl<HTMLDivElement>('imgConvertResult').hidden = false;
    }
    if (failures.length) convertError(`未完成 ${failures.length} 张：${failures.join('；')}`);
  } finally {
    busy = false;
    status.hidden = true;
    convertEl<HTMLButtonElement>('imgConvertPick').disabled = false;
    convertEl<HTMLInputElement>('imgConvertBatch').disabled = false;
    renderConvertFiles(states);
  }
}

/** Wires selection, format, quality, size, conversion, and folder opening. */
export function setupImageConvertTool(): void {
  convertEl<HTMLButtonElement>('imgConvertPick').addEventListener('click', () => void chooseConvertFiles());
  convertEl<HTMLInputElement>('imgConvertBatch').addEventListener('change', () => {
    files = [];
    convertEl<HTMLDivElement>('imgConvertResult').hidden = true;
    convertEl<HTMLDivElement>('imgConvertError').hidden = true;
    convertEl<HTMLButtonElement>('imgConvertPick').textContent = convertEl<HTMLInputElement>('imgConvertBatch').checked ? '选择多张图片' : '选择图片';
    renderConvertFiles();
  });
  document.querySelectorAll<HTMLInputElement>('input[name="imgFormat"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('#imgConvertFormats .format-choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
    updateQualityAvailability();
  }));
  convertEl<HTMLInputElement>('imgConvertQuality').addEventListener('input', () => {
    convertEl<HTMLElement>('imgQualityValue').textContent = convertEl<HTMLInputElement>('imgConvertQuality').value;
  });
  document.querySelectorAll<HTMLInputElement>('input[name="imgMaxDimension"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('#imgConvertDimensions .choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
  }));
  convertEl<HTMLButtonElement>('imgConvertRun').addEventListener('click', () => void convertImages());
  convertEl<HTMLButtonElement>('imgConvertOpenFolder').addEventListener('click', async () => {
    try { await ImageConvertService.OpenImageConvertOutputFolder(); }
    catch (error) { convertError(error); }
  });
  updateQualityAvailability();
  renderConvertFiles();
}
