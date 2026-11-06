import { VideoCompressService, type LocalSource } from '../../../bindings/example.com/pdf-desktop/internal/app';
import { COMPRESS_PRESETS, describeCompression, formatSize } from './presets';

let files: LocalSource[] = [];
let busy = false;

/** Finds one required video compression element. */
function compressEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少视频压缩界面元素：${id}`);
  return node as T;
}

/** Displays one native or validation error using text content only. */
function compressError(error: unknown): void {
  const box = compressEl<HTMLDivElement>('compressError');
  box.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : '视频压缩失败';
  box.hidden = false;
}

/** Updates the visible file queue and enabled processing controls. */
function renderCompressFiles(states: Map<number, string> = new Map()): void {
  const list = compressEl<HTMLOListElement>('compressFiles');
  list.replaceChildren();
  files.forEach((file, index) => {
    const item = document.createElement('li');
    item.className = 'video-file';
    const copy = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = file.name;
    name.title = file.path;
    const detail = document.createElement('small');
    detail.textContent = `${formatSize(file.bytes)} · ${states.get(index) ?? '等待压缩'}`;
    copy.append(name, detail);
    item.append(copy);
    list.append(item);
  });
  list.hidden = files.length === 0;
  compressEl<HTMLDivElement>('compressEmpty').hidden = files.length > 0;
  compressEl<HTMLButtonElement>('compressRun').disabled = busy || !files.length;
}

/** Opens the native selector in single or multiple mode. */
async function chooseCompressFiles(): Promise<void> {
  if (busy) return;
  compressEl<HTMLDivElement>('compressError').hidden = true;
  try {
    const selected = await VideoCompressService.ChooseVideos(compressEl<HTMLInputElement>('compressBatch').checked);
    if (!selected?.length) return;
    files = selected;
    compressEl<HTMLDivElement>('compressResult').hidden = true;
    renderCompressFiles();
  } catch (error) { compressError(error); }
}

/** Compresses selected videos sequentially so one failure does not stop the batch. */
async function compressVideos(): Promise<void> {
  if (busy || !files.length) return;
  const preset = document.querySelector<HTMLInputElement>('input[name="compressPreset"]:checked')?.value ?? COMPRESS_PRESETS[0].id;
  busy = true;
  compressEl<HTMLButtonElement>('compressPick').disabled = true;
  compressEl<HTMLInputElement>('compressBatch').disabled = true;
  document.querySelectorAll<HTMLInputElement>('#compressPresets input').forEach((input) => { input.disabled = true; });
  compressEl<HTMLDivElement>('compressError').hidden = true;
  compressEl<HTMLDivElement>('compressResult').hidden = true;
  const status = compressEl<HTMLDivElement>('compressStatus');
  const states = new Map<number, string>();
  const failures: string[] = [];
  let successes = 0;
  let lastInputBytes = 0;
  let lastOutputBytes = 0;
  let lastPath = '';
  try {
    for (let index = 0; index < files.length; index++) {
      status.textContent = `正在压缩 ${index + 1} / ${files.length}：${files[index].name}`;
      status.hidden = false;
      states.set(index, '处理中…');
      renderCompressFiles(states);
      try {
        const result = await VideoCompressService.CompressVideo(index, preset);
        successes++;
        lastInputBytes = result.inputBytes;
        lastOutputBytes = result.bytes;
        lastPath = result.path;
        states.set(index, describeCompression(result.inputBytes, result.bytes));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        states.set(index, `失败：${message}`);
        failures.push(`${files[index].name}：${message}`);
      }
      renderCompressFiles(states);
    }
    if (successes) {
      compressEl<HTMLElement>('compressResultTitle').textContent = `已压缩 ${successes} / ${files.length} 个视频`;
      compressEl<HTMLElement>('compressResultPath').textContent = files.length === 1
        ? `${describeCompression(lastInputBytes, lastOutputBytes)} · ${lastPath}`
        : '结果保存在各视频所在文件夹';
      compressEl<HTMLDivElement>('compressResult').hidden = false;
    }
    if (failures.length) compressError(`未完成 ${failures.length} 个：${failures.join('；')}`);
  } finally {
    busy = false;
    status.hidden = true;
    compressEl<HTMLButtonElement>('compressPick').disabled = false;
    compressEl<HTMLInputElement>('compressBatch').disabled = false;
    document.querySelectorAll<HTMLInputElement>('#compressPresets input').forEach((input) => { input.disabled = false; });
    renderCompressFiles(states);
  }
}

/** Wires batch selection, preset choice, compression, and folder opening. */
export function setupVideoCompressTool(): void {
  compressEl<HTMLButtonElement>('compressPick').addEventListener('click', () => void chooseCompressFiles());
  compressEl<HTMLInputElement>('compressBatch').addEventListener('change', () => {
    files = [];
    compressEl<HTMLDivElement>('compressResult').hidden = true;
    compressEl<HTMLDivElement>('compressError').hidden = true;
    compressEl<HTMLButtonElement>('compressPick').textContent = compressEl<HTMLInputElement>('compressBatch').checked ? '选择多个视频' : '选择视频';
    renderCompressFiles();
  });
  document.querySelectorAll<HTMLInputElement>('input[name="compressPreset"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('#compressPresets .mode-choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
  }));
  compressEl<HTMLButtonElement>('compressRun').addEventListener('click', () => void compressVideos());
  compressEl<HTMLButtonElement>('compressOpenFolder').addEventListener('click', async () => {
    try { await VideoCompressService.OpenVideoCompressOutputFolder(); }
    catch (error) { compressError(error); }
  });
  renderCompressFiles();
}
