import { VideoGIFService, type LocalSource } from '../../../bindings/example.com/pdf-desktop/internal/app';
import { parseTimecode } from '../video-trim/timecode';
import { formatGIFSize } from './options';

let file: LocalSource | null = null;
let busy = false;

/** Finds one required GIF element. */
function gifEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少 GIF 制作界面元素：${id}`);
  return node as T;
}

/** Displays one native or validation error using text content only. */
function gifError(error: unknown): void {
  const box = gifEl<HTMLDivElement>('gifError');
  box.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : 'GIF 生成失败';
  box.hidden = false;
}

/** Reads and validates the start and end time inputs. */
function readTimeRange(): { startMs: number; endMs: number } | null {
  const startMs = parseTimecode(gifEl<HTMLInputElement>('gifStart').value);
  const endMs = parseTimecode(gifEl<HTMLInputElement>('gifEnd').value);
  const hint = gifEl<HTMLDivElement>('gifHint');
  if (startMs === null || endMs === null) {
    hint.textContent = startMs === null && endMs === null ? '请输入开始与结束时间' : startMs === null ? '开始时间格式无效' : '结束时间格式无效';
    return null;
  }
  if (endMs <= startMs) {
    hint.textContent = '结束时间需要晚于开始时间';
    return null;
  }
  const seconds = Math.round((endMs - startMs) / 1000);
  hint.textContent = seconds > 60 ? `片段最长 60 秒，当前约 ${seconds} 秒` : `将截取约 ${seconds} 秒的片段`;
  return { startMs, endMs };
}

/** Shows the single selected video and enables the export controls. */
function renderGifFile(): void {
  const card = gifEl<HTMLDivElement>('gifFile');
  card.replaceChildren();
  if (!file) {
    card.hidden = true;
  } else {
    const name = document.createElement('strong');
    name.textContent = file.name;
    name.title = file.path;
    const detail = document.createElement('small');
    detail.textContent = '已选择 · 可设置片段后生成';
    card.append(name, detail);
    card.hidden = false;
  }
  gifEl<HTMLDivElement>('gifEmpty').hidden = file !== null;
  const range = readTimeRange();
  const tooLong = range !== null && range.endMs - range.startMs > 60_000;
  gifEl<HTMLButtonElement>('gifRun').disabled = busy || !file || range === null || tooLong;
}

/** Opens the native selector for one video. */
async function chooseGifFile(): Promise<void> {
  if (busy) return;
  gifEl<HTMLDivElement>('gifError').hidden = true;
  try {
    const selected = await VideoGIFService.ChooseVideo();
    if (!selected?.length) return;
    file = selected[0];
    gifEl<HTMLDivElement>('gifResult').hidden = true;
    renderGifFile();
  } catch (error) { gifError(error); }
}

/** Exports the selected segment as a GIF. */
async function createGIF(): Promise<void> {
  if (busy || !file) return;
  const range = readTimeRange();
  if (!range) return;
  const width = Number(document.querySelector<HTMLInputElement>('input[name="gifWidth"]:checked')?.value ?? 480);
  const fps = Number(document.querySelector<HTMLInputElement>('input[name="gifFps"]:checked')?.value ?? 15);
  busy = true;
  gifEl<HTMLButtonElement>('gifPick').disabled = true;
  gifEl<HTMLInputElement>('gifStart').disabled = true;
  gifEl<HTMLInputElement>('gifEnd').disabled = true;
  gifEl<HTMLDivElement>('gifError').hidden = true;
  gifEl<HTMLDivElement>('gifResult').hidden = true;
  const status = gifEl<HTMLDivElement>('gifStatus');
  status.textContent = '正在生成 GIF…';
  status.hidden = false;
  try {
    const result = await VideoGIFService.CreateGIF(range.startMs, range.endMs, width, fps);
    gifEl<HTMLElement>('gifResultTitle').textContent = `GIF 已生成 · ${formatGIFSize(result.bytes)}`;
    gifEl<HTMLElement>('gifResultPath').textContent = result.path;
    gifEl<HTMLDivElement>('gifResult').hidden = false;
  } catch (error) {
    gifError(error);
  } finally {
    busy = false;
    status.hidden = true;
    gifEl<HTMLButtonElement>('gifPick').disabled = false;
    gifEl<HTMLInputElement>('gifStart').disabled = false;
    gifEl<HTMLInputElement>('gifEnd').disabled = false;
    renderGifFile();
  }
}

/** Wires selection, time inputs, options, export, and folder opening. */
export function setupVideoGIFTool(): void {
  gifEl<HTMLButtonElement>('gifPick').addEventListener('click', () => void chooseGifFile());
  gifEl<HTMLInputElement>('gifStart').addEventListener('input', () => renderGifFile());
  gifEl<HTMLInputElement>('gifEnd').addEventListener('input', () => renderGifFile());
  document.querySelectorAll<HTMLInputElement>('input[name="gifWidth"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('#gifWidths .choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
  }));
  document.querySelectorAll<HTMLInputElement>('input[name="gifFps"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('#gifFpsList .choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
  }));
  gifEl<HTMLButtonElement>('gifRun').addEventListener('click', () => void createGIF());
  gifEl<HTMLButtonElement>('gifOpenFolder').addEventListener('click', async () => {
    try { await VideoGIFService.OpenVideoGIFOutputFolder(); }
    catch (error) { gifError(error); }
  });
  renderGifFile();
}
