import { VideoSpeedService, type LocalSource } from '../../../bindings/example.com/pdf-desktop/internal/app';
import { formatSize } from '../shared/format';
import { rateLabel } from './options';

let files: LocalSource[] = [];
let busy = false;

/** Finds one required speed element. */
function speedEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少视频倍速界面元素：${id}`);
  return node as T;
}

/** Displays one native or validation error using text content only. */
function speedError(error: unknown): void {
  const box = speedEl<HTMLDivElement>('speedError');
  box.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : '视频倍速失败';
  box.hidden = false;
}

/** Reads the selected playback rate. */
function currentRate(): number {
  return Number(document.querySelector<HTMLInputElement>('input[name="speedRate"]:checked')?.value ?? 2);
}

/** Updates the visible file queue and enabled controls. */
function renderSpeedFiles(states: Map<number, string> = new Map()): void {
  const list = speedEl<HTMLOListElement>('speedFiles');
  list.replaceChildren();
  files.forEach((file, index) => {
    const item = document.createElement('li');
    item.className = 'video-file';
    const copy = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = file.name;
    name.title = file.path;
    const detail = document.createElement('small');
    detail.textContent = `${formatSize(file.bytes)} · ${states.get(index) ?? '等待处理'}`;
    copy.append(name, detail);
    item.append(copy);
    list.append(item);
  });
  list.hidden = files.length === 0;
  speedEl<HTMLDivElement>('speedEmpty').hidden = files.length > 0;
  speedEl<HTMLButtonElement>('speedRun').disabled = busy || !files.length;
}

/** Opens the native selector in single or multiple mode. */
async function chooseSpeedFiles(): Promise<void> {
  if (busy) return;
  speedEl<HTMLDivElement>('speedError').hidden = true;
  try {
    const selected = await VideoSpeedService.ChooseVideos(speedEl<HTMLInputElement>('speedBatch').checked);
    if (!selected?.length) return;
    files = selected;
    speedEl<HTMLDivElement>('speedResult').hidden = true;
    renderSpeedFiles();
  } catch (error) { speedError(error); }
}

/** Re-encodes selected videos sequentially. */
async function changeSpeed(): Promise<void> {
  if (busy || !files.length) return;
  const rate = currentRate();
  busy = true;
  speedEl<HTMLButtonElement>('speedPick').disabled = true;
  speedEl<HTMLInputElement>('speedBatch').disabled = true;
  document.querySelectorAll<HTMLInputElement>('#speedRates input').forEach((input) => { input.disabled = true; });
  speedEl<HTMLDivElement>('speedError').hidden = true;
  speedEl<HTMLDivElement>('speedResult').hidden = true;
  const status = speedEl<HTMLDivElement>('speedStatus');
  const states = new Map<number, string>();
  const failures: string[] = [];
  let successes = 0;
  let lastPath = '';
  try {
    for (let index = 0; index < files.length; index++) {
      status.textContent = `正在处理 ${index + 1} / ${files.length}：${files[index].name}`;
      status.hidden = false;
      states.set(index, '处理中…');
      renderSpeedFiles(states);
      try {
        const result = await VideoSpeedService.ChangeSpeed(index, rate);
        successes++;
        lastPath = result.path;
        states.set(index, `已保存 ${rateLabel(rate)} · 约 ${Math.round(result.durationMs / 1000)} 秒`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        states.set(index, `失败：${message}`);
        failures.push(`${files[index].name}：${message}`);
      }
      renderSpeedFiles(states);
    }
    if (successes) {
      speedEl<HTMLElement>('speedResultTitle').textContent = `已处理 ${successes} / ${files.length} 个视频`;
      speedEl<HTMLElement>('speedResultPath').textContent = files.length === 1 ? lastPath : '结果保存在各视频所在文件夹';
      speedEl<HTMLDivElement>('speedResult').hidden = false;
    }
    if (failures.length) speedError(`未完成 ${failures.length} 个：${failures.join('；')}`);
  } finally {
    busy = false;
    status.hidden = true;
    speedEl<HTMLButtonElement>('speedPick').disabled = false;
    speedEl<HTMLInputElement>('speedBatch').disabled = false;
    document.querySelectorAll<HTMLInputElement>('#speedRates input').forEach((input) => { input.disabled = false; });
    renderSpeedFiles(states);
  }
}

/** Wires selection, rate, processing, and folder opening. */
export function setupVideoSpeedTool(): void {
  speedEl<HTMLButtonElement>('speedPick').addEventListener('click', () => void chooseSpeedFiles());
  speedEl<HTMLInputElement>('speedBatch').addEventListener('change', () => {
    files = [];
    speedEl<HTMLDivElement>('speedResult').hidden = true;
    speedEl<HTMLDivElement>('speedError').hidden = true;
    speedEl<HTMLButtonElement>('speedPick').textContent = speedEl<HTMLInputElement>('speedBatch').checked ? '选择多个视频' : '选择视频';
    renderSpeedFiles();
  });
  document.querySelectorAll<HTMLInputElement>('input[name="speedRate"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('#speedRates .speed-choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
  }));
  speedEl<HTMLButtonElement>('speedRun').addEventListener('click', () => void changeSpeed());
  speedEl<HTMLButtonElement>('speedOpenFolder').addEventListener('click', async () => {
    try { await VideoSpeedService.OpenVideoSpeedOutputFolder(); }
    catch (error) { speedError(error); }
  });
  renderSpeedFiles();
}
