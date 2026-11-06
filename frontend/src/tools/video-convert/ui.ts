import { VideoConvertService, type LocalSource } from '../../../bindings/example.com/pdf-desktop/internal/app';
import { describeChange, formatSize } from '../shared/format';
import { isVideoTarget, type VideoTarget } from './options';

let files: LocalSource[] = [];
let busy = false;

/** Finds one required video conversion element. */
function vconvEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少视频格式转换界面元素：${id}`);
  return node as T;
}

/** Displays one native or validation error using text content only. */
function vconvError(error: unknown): void {
  const box = vconvEl<HTMLDivElement>('vconvError');
  box.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : '视频格式转换失败';
  box.hidden = false;
}

/** Reads the current target container. */
function currentTarget(): VideoTarget {
  const value = document.querySelector<HTMLInputElement>('input[name="vconvTarget"]:checked')?.value ?? 'mp4';
  return isVideoTarget(value) ? value : 'mp4';
}

/** Updates the visible file queue and enabled controls. */
function renderVconvFiles(states: Map<number, string> = new Map()): void {
  const list = vconvEl<HTMLOListElement>('vconvFiles');
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
  vconvEl<HTMLDivElement>('vconvEmpty').hidden = files.length > 0;
  vconvEl<HTMLButtonElement>('vconvRun').disabled = busy || !files.length;
}

/** Opens the native selector in single or multiple mode. */
async function chooseVconvFiles(): Promise<void> {
  if (busy) return;
  vconvEl<HTMLDivElement>('vconvError').hidden = true;
  try {
    const selected = await VideoConvertService.ChooseVideos(vconvEl<HTMLInputElement>('vconvBatch').checked);
    if (!selected?.length) return;
    files = selected;
    vconvEl<HTMLDivElement>('vconvResult').hidden = true;
    renderVconvFiles();
  } catch (error) { vconvError(error); }
}

/** Converts selected videos sequentially so one failure does not stop the batch. */
async function convertVideos(): Promise<void> {
  if (busy || !files.length) return;
  const target = currentTarget();
  busy = true;
  vconvEl<HTMLButtonElement>('vconvPick').disabled = true;
  vconvEl<HTMLInputElement>('vconvBatch').disabled = true;
  document.querySelectorAll<HTMLInputElement>('#vconvTargets input').forEach((input) => { input.disabled = true; });
  vconvEl<HTMLDivElement>('vconvError').hidden = true;
  vconvEl<HTMLDivElement>('vconvResult').hidden = true;
  const status = vconvEl<HTMLDivElement>('vconvStatus');
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
      renderVconvFiles(states);
      try {
        const result = await VideoConvertService.ConvertVideo(index, target);
        successes++;
        lastInputBytes = result.inputBytes;
        lastOutputBytes = result.bytes;
        lastPath = result.path;
        states.set(index, `已保存 ${target.toUpperCase()} · ${describeChange(result.inputBytes, result.bytes)}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        states.set(index, `失败：${message}`);
        failures.push(`${files[index].name}：${message}`);
      }
      renderVconvFiles(states);
    }
    if (successes) {
      vconvEl<HTMLElement>('vconvResultTitle').textContent = `已转换 ${successes} / ${files.length} 个视频`;
      vconvEl<HTMLElement>('vconvResultPath').textContent = files.length === 1
        ? `${describeChange(lastInputBytes, lastOutputBytes)} · ${lastPath}`
        : '结果保存在各视频所在文件夹';
      vconvEl<HTMLDivElement>('vconvResult').hidden = false;
    }
    if (failures.length) vconvError(`未完成 ${failures.length} 个：${failures.join('；')}`);
  } finally {
    busy = false;
    status.hidden = true;
    vconvEl<HTMLButtonElement>('vconvPick').disabled = false;
    vconvEl<HTMLInputElement>('vconvBatch').disabled = false;
    document.querySelectorAll<HTMLInputElement>('#vconvTargets input').forEach((input) => { input.disabled = false; });
    renderVconvFiles(states);
  }
}

/** Wires selection, target container, conversion, and folder opening. */
export function setupVideoConvertTool(): void {
  vconvEl<HTMLButtonElement>('vconvPick').addEventListener('click', () => void chooseVconvFiles());
  vconvEl<HTMLInputElement>('vconvBatch').addEventListener('change', () => {
    files = [];
    vconvEl<HTMLDivElement>('vconvResult').hidden = true;
    vconvEl<HTMLDivElement>('vconvError').hidden = true;
    vconvEl<HTMLButtonElement>('vconvPick').textContent = vconvEl<HTMLInputElement>('vconvBatch').checked ? '选择多个视频' : '选择视频';
    renderVconvFiles();
  });
  document.querySelectorAll<HTMLInputElement>('input[name="vconvTarget"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('#vconvTargets .mode-choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
  }));
  vconvEl<HTMLButtonElement>('vconvRun').addEventListener('click', () => void convertVideos());
  vconvEl<HTMLButtonElement>('vconvOpenFolder').addEventListener('click', async () => {
    try { await VideoConvertService.OpenVideoConvertOutputFolder(); }
    catch (error) { vconvError(error); }
  });
  renderVconvFiles();
}
