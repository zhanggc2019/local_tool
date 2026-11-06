import { VideoTrimService, type LocalSource } from '../../../bindings/example.com/pdf-desktop/internal/app';
import { parseTimecode } from './timecode';

let files: LocalSource[] = [];
let busy = false;

/** Finds one required video trim element. */
function trimEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少视频剪辑界面元素：${id}`);
  return node as T;
}

/** Displays one native or validation error using text content only. */
function trimError(error: unknown): void {
  const box = trimEl<HTMLDivElement>('trimError');
  box.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : '视频剪辑失败';
  box.hidden = false;
}

/** Reads and validates the start and end time inputs. */
function readTimeRange(): { startMs: number; endMs: number } | null {
  const startMs = parseTimecode(trimEl<HTMLInputElement>('trimStart').value);
  const endMs = parseTimecode(trimEl<HTMLInputElement>('trimEnd').value);
  const hint = trimEl<HTMLDivElement>('trimHint');
  if (startMs === null || endMs === null) {
    hint.textContent = startMs === null && endMs === null ? '请输入开始与结束时间' : startMs === null ? '开始时间格式无效' : '结束时间格式无效';
    return null;
  }
  if (endMs <= startMs) {
    hint.textContent = '结束时间需要晚于开始时间';
    return null;
  }
  hint.textContent = `将保留 ${Math.round((endMs - startMs) / 1000)} 秒的片段`;
  return { startMs, endMs };
}

/** Updates the visible file queue and enabled processing controls. */
function renderTrimFiles(states: Map<number, string> = new Map()): void {
  const list = trimEl<HTMLOListElement>('trimFiles');
  list.replaceChildren();
  files.forEach((file, index) => {
    const item = document.createElement('li');
    item.className = 'video-file';
    const copy = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = file.name;
    name.title = file.path;
    const detail = document.createElement('small');
    detail.textContent = states.get(index) ?? '等待剪辑';
    copy.append(name, detail);
    item.append(copy);
    list.append(item);
  });
  list.hidden = files.length === 0;
  trimEl<HTMLDivElement>('trimEmpty').hidden = files.length > 0;
  const range = readTimeRange();
  trimEl<HTMLButtonElement>('trimRun').disabled = busy || !files.length || range === null;
}

/** Opens the native selector in single or multiple mode. */
async function chooseTrimFiles(): Promise<void> {
  if (busy) return;
  trimEl<HTMLDivElement>('trimError').hidden = true;
  try {
    const selected = await VideoTrimService.ChooseVideos(trimEl<HTMLInputElement>('trimBatch').checked);
    if (!selected?.length) return;
    files = selected;
    trimEl<HTMLDivElement>('trimResult').hidden = true;
    renderTrimFiles();
  } catch (error) { trimError(error); }
}

/** Trims selected videos sequentially so one failure does not stop the batch. */
async function trimVideos(): Promise<void> {
  if (busy || !files.length) return;
  const range = readTimeRange();
  if (!range) return;
  const mode = document.querySelector<HTMLInputElement>('input[name="trimMode"]:checked')?.value ?? 'fast';
  busy = true;
  trimEl<HTMLButtonElement>('trimPick').disabled = true;
  trimEl<HTMLInputElement>('trimBatch').disabled = true;
  trimEl<HTMLInputElement>('trimStart').disabled = true;
  trimEl<HTMLInputElement>('trimEnd').disabled = true;
  trimEl<HTMLDivElement>('trimError').hidden = true;
  trimEl<HTMLDivElement>('trimResult').hidden = true;
  const status = trimEl<HTMLDivElement>('trimStatus');
  const states = new Map<number, string>();
  const failures: string[] = [];
  let successes = 0;
  let lastPath = '';
  try {
    for (let index = 0; index < files.length; index++) {
      status.textContent = `正在剪辑 ${index + 1} / ${files.length}：${files[index].name}`;
      status.hidden = false;
      states.set(index, '处理中…');
      renderTrimFiles(states);
      try {
        const result = await VideoTrimService.TrimVideo(index, range.startMs, range.endMs, mode);
        successes++;
        lastPath = result.path;
        states.set(index, `已保存 · 约 ${Math.round(result.durationMs / 1000)} 秒`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        states.set(index, `失败：${message}`);
        failures.push(`${files[index].name}：${message}`);
      }
      renderTrimFiles(states);
    }
    if (successes) {
      trimEl<HTMLElement>('trimResultTitle').textContent = `已剪辑 ${successes} / ${files.length} 个视频`;
      trimEl<HTMLElement>('trimResultPath').textContent = files.length === 1 ? lastPath : '结果保存在各视频所在文件夹';
      trimEl<HTMLDivElement>('trimResult').hidden = false;
    }
    if (failures.length) trimError(`未完成 ${failures.length} 个：${failures.join('；')}`);
  } finally {
    busy = false;
    status.hidden = true;
    trimEl<HTMLButtonElement>('trimPick').disabled = false;
    trimEl<HTMLInputElement>('trimBatch').disabled = false;
    trimEl<HTMLInputElement>('trimStart').disabled = false;
    trimEl<HTMLInputElement>('trimEnd').disabled = false;
    renderTrimFiles(states);
  }
}

/** Wires selection, time inputs, mode, conversion, and folder opening. */
export function setupVideoTrimTool(): void {
  trimEl<HTMLButtonElement>('trimPick').addEventListener('click', () => void chooseTrimFiles());
  trimEl<HTMLInputElement>('trimBatch').addEventListener('change', () => {
    files = [];
    trimEl<HTMLDivElement>('trimResult').hidden = true;
    trimEl<HTMLDivElement>('trimError').hidden = true;
    trimEl<HTMLButtonElement>('trimPick').textContent = trimEl<HTMLInputElement>('trimBatch').checked ? '选择多个视频' : '选择视频';
    renderTrimFiles();
  });
  trimEl<HTMLInputElement>('trimStart').addEventListener('input', () => renderTrimFiles());
  trimEl<HTMLInputElement>('trimEnd').addEventListener('input', () => renderTrimFiles());
  document.querySelectorAll<HTMLInputElement>('input[name="trimMode"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('#trimModes .mode-choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
  }));
  trimEl<HTMLButtonElement>('trimRun').addEventListener('click', () => void trimVideos());
  trimEl<HTMLButtonElement>('trimOpenFolder').addEventListener('click', async () => {
    try { await VideoTrimService.OpenVideoTrimOutputFolder(); }
    catch (error) { trimError(error); }
  });
  renderTrimFiles();
}
