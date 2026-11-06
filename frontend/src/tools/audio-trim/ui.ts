import { AudioTrimService, type LocalSource } from '../../../bindings/example.com/pdf-desktop/internal/app';
import { formatSize } from '../shared/format';
import { parseTimecode } from '../video-trim/timecode';

let files: LocalSource[] = [];
let busy = false;

/** Finds one required audio trim element. */
function atrimEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少音频剪辑界面元素：${id}`);
  return node as T;
}

/** Displays one native or validation error using text content only. */
function atrimError(error: unknown): void {
  const box = atrimEl<HTMLDivElement>('atrimError');
  box.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : '音频剪辑失败';
  box.hidden = false;
}

/** Reads and validates the start and end time inputs. */
function readTimeRange(): { startMs: number; endMs: number } | null {
  const startMs = parseTimecode(atrimEl<HTMLInputElement>('atrimStart').value);
  const endMs = parseTimecode(atrimEl<HTMLInputElement>('atrimEnd').value);
  const hint = atrimEl<HTMLDivElement>('atrimHint');
  if (startMs === null || endMs === null) {
    hint.textContent = startMs === null && endMs === null ? '请输入开始与结束时间' : startMs === null ? '开始时间格式无效' : '结束时间格式无效';
    return null;
  }
  if (endMs <= startMs) {
    hint.textContent = '结束时间需要晚于开始时间';
    return null;
  }
  hint.textContent = `将保留约 ${Math.round((endMs - startMs) / 1000)} 秒的片段`;
  return { startMs, endMs };
}

/** Updates the visible file queue and enabled controls. */
function renderAtrimFiles(states: Map<number, string> = new Map()): void {
  const list = atrimEl<HTMLOListElement>('atrimFiles');
  list.replaceChildren();
  files.forEach((file, index) => {
    const item = document.createElement('li');
    item.className = 'video-file';
    const copy = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = file.name;
    name.title = file.path;
    const detail = document.createElement('small');
    detail.textContent = `${formatSize(file.bytes)} · ${states.get(index) ?? '等待剪辑'}`;
    copy.append(name, detail);
    item.append(copy);
    list.append(item);
  });
  list.hidden = files.length === 0;
  atrimEl<HTMLDivElement>('atrimEmpty').hidden = files.length > 0;
  const range = readTimeRange();
  atrimEl<HTMLButtonElement>('atrimRun').disabled = busy || !files.length || range === null;
}

/** Opens the native selector in single or multiple mode. */
async function chooseAtrimFiles(): Promise<void> {
  if (busy) return;
  atrimEl<HTMLDivElement>('atrimError').hidden = true;
  try {
    const selected = await AudioTrimService.ChooseAudios(atrimEl<HTMLInputElement>('atrimBatch').checked);
    if (!selected?.length) return;
    files = selected;
    atrimEl<HTMLDivElement>('atrimResult').hidden = true;
    renderAtrimFiles();
  } catch (error) { atrimError(error); }
}

/** Trims selected audio files sequentially. */
async function trimAudios(): Promise<void> {
  if (busy || !files.length) return;
  const range = readTimeRange();
  if (!range) return;
  const mode = document.querySelector<HTMLInputElement>('input[name="atrimMode"]:checked')?.value ?? 'fast';
  busy = true;
  atrimEl<HTMLButtonElement>('atrimPick').disabled = true;
  atrimEl<HTMLInputElement>('atrimBatch').disabled = true;
  atrimEl<HTMLInputElement>('atrimStart').disabled = true;
  atrimEl<HTMLInputElement>('atrimEnd').disabled = true;
  atrimEl<HTMLDivElement>('atrimError').hidden = true;
  atrimEl<HTMLDivElement>('atrimResult').hidden = true;
  const status = atrimEl<HTMLDivElement>('atrimStatus');
  const states = new Map<number, string>();
  const failures: string[] = [];
  let successes = 0;
  let lastPath = '';
  try {
    for (let index = 0; index < files.length; index++) {
      status.textContent = `正在剪辑 ${index + 1} / ${files.length}：${files[index].name}`;
      status.hidden = false;
      states.set(index, '处理中…');
      renderAtrimFiles(states);
      try {
        const result = await AudioTrimService.TrimAudio(index, range.startMs, range.endMs, mode);
        successes++;
        lastPath = result.path;
        states.set(index, `已保存 · ${formatSize(result.bytes)}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        states.set(index, `失败：${message}`);
        failures.push(`${files[index].name}：${message}`);
      }
      renderAtrimFiles(states);
    }
    if (successes) {
      atrimEl<HTMLElement>('atrimResultTitle').textContent = `已剪辑 ${successes} / ${files.length} 个音频`;
      atrimEl<HTMLElement>('atrimResultPath').textContent = files.length === 1 ? lastPath : '结果保存在各音频所在文件夹';
      atrimEl<HTMLDivElement>('atrimResult').hidden = false;
    }
    if (failures.length) atrimError(`未完成 ${failures.length} 个：${failures.join('；')}`);
  } finally {
    busy = false;
    status.hidden = true;
    atrimEl<HTMLButtonElement>('atrimPick').disabled = false;
    atrimEl<HTMLInputElement>('atrimBatch').disabled = false;
    atrimEl<HTMLInputElement>('atrimStart').disabled = false;
    atrimEl<HTMLInputElement>('atrimEnd').disabled = false;
    renderAtrimFiles(states);
  }
}

/** Wires selection, time inputs, mode, trimming, and folder opening. */
export function setupAudioTrimTool(): void {
  atrimEl<HTMLButtonElement>('atrimPick').addEventListener('click', () => void chooseAtrimFiles());
  atrimEl<HTMLInputElement>('atrimBatch').addEventListener('change', () => {
    files = [];
    atrimEl<HTMLDivElement>('atrimResult').hidden = true;
    atrimEl<HTMLDivElement>('atrimError').hidden = true;
    atrimEl<HTMLButtonElement>('atrimPick').textContent = atrimEl<HTMLInputElement>('atrimBatch').checked ? '选择多个音频' : '选择音频';
    renderAtrimFiles();
  });
  atrimEl<HTMLInputElement>('atrimStart').addEventListener('input', () => renderAtrimFiles());
  atrimEl<HTMLInputElement>('atrimEnd').addEventListener('input', () => renderAtrimFiles());
  document.querySelectorAll<HTMLInputElement>('input[name="atrimMode"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('#atrimModes .mode-choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
  }));
  atrimEl<HTMLButtonElement>('atrimRun').addEventListener('click', () => void trimAudios());
  atrimEl<HTMLButtonElement>('atrimOpenFolder').addEventListener('click', async () => {
    try { await AudioTrimService.OpenAudioTrimOutputFolder(); }
    catch (error) { atrimError(error); }
  });
  renderAtrimFiles();
}
