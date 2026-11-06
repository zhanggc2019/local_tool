import { VideoFrameService, type LocalSource } from '../../../bindings/example.com/pdf-desktop/internal/app';
import { parseTimecode } from '../video-trim/timecode';
import { isFrameMode } from './options';

let file: LocalSource | null = null;
let busy = false;

/** Finds one required frame capture element. */
function frameEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少视频截图界面元素：${id}`);
  return node as T;
}

/** Displays one native or validation error using text content only. */
function frameError(error: unknown): void {
  const box = frameEl<HTMLDivElement>('frameError');
  box.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : '视频截图失败';
  box.hidden = false;
}

/** Reads the active capture mode. */
function currentMode(): 'single' | 'spread' {
  const value = document.querySelector<HTMLInputElement>('input[name="frameMode"]:checked')?.value ?? 'single';
  return isFrameMode(value) && value === 'spread' ? 'spread' : 'single';
}

/** Validates the time input when single mode is active. */
function readTimestamp(): number | null {
  if (currentMode() !== 'single') return 0;
  const ms = parseTimecode(frameEl<HTMLInputElement>('frameTime').value);
  const hint = frameEl<HTMLDivElement>('frameHint');
  if (ms === null) {
    hint.textContent = frameEl<HTMLInputElement>('frameTime').value.trim() ? '时间格式无效' : '请输入截图时间';
    return null;
  }
  hint.textContent = `将在 ${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')} 处截取一帧`;
  return ms;
}

/** Shows the selected video and updates the enabled controls. */
function renderFrameFile(): void {
  const card = frameEl<HTMLDivElement>('frameFile');
  card.replaceChildren();
  if (!file) {
    card.hidden = true;
  } else {
    const name = document.createElement('strong');
    name.textContent = file.name;
    name.title = file.path;
    const detail = document.createElement('small');
    detail.textContent = '已选择 · 可设置方式后截图';
    card.append(name, detail);
    card.hidden = false;
  }
  frameEl<HTMLDivElement>('frameEmpty').hidden = file !== null;
  const timestamp = readTimestamp();
  frameEl<HTMLButtonElement>('frameRun').disabled = busy || !file || timestamp === null;
}

/** Opens the native selector for one video. */
async function chooseFrameFile(): Promise<void> {
  if (busy) return;
  frameEl<HTMLDivElement>('frameError').hidden = true;
  try {
    const selected = await VideoFrameService.ChooseVideo();
    if (!selected?.length) return;
    file = selected[0];
    frameEl<HTMLDivElement>('frameResult').hidden = true;
    renderFrameFile();
  } catch (error) { frameError(error); }
}

/** Captures the requested frames from the selected video. */
async function captureFrames(): Promise<void> {
  if (busy || !file) return;
  const mode = currentMode();
  const timestamp = readTimestamp();
  if (timestamp === null) return;
  const count = Number(document.querySelector<HTMLInputElement>('input[name="frameCount"]:checked')?.value ?? 6);
  busy = true;
  frameEl<HTMLButtonElement>('framePick').disabled = true;
  frameEl<HTMLInputElement>('frameTime').disabled = true;
  frameEl<HTMLDivElement>('frameError').hidden = true;
  frameEl<HTMLDivElement>('frameResult').hidden = true;
  const status = frameEl<HTMLDivElement>('frameStatus');
  status.textContent = mode === 'single' ? '正在截取画面…' : '正在均分截取画面…';
  status.hidden = false;
  try {
    const result = await VideoFrameService.CaptureFrames(mode, timestamp, count);
    const paths = result.paths ?? [];
    frameEl<HTMLElement>('frameResultTitle').textContent = `已保存 ${result.count} 张截图`;
    frameEl<HTMLElement>('frameResultPath').textContent = result.count === 1 && paths.length
      ? paths[0]
      : '截图按编号保存在原视频所在文件夹';
    frameEl<HTMLDivElement>('frameResult').hidden = false;
  } catch (error) {
    frameError(error);
  } finally {
    busy = false;
    status.hidden = true;
    frameEl<HTMLButtonElement>('framePick').disabled = false;
    frameEl<HTMLInputElement>('frameTime').disabled = false;
    renderFrameFile();
  }
}

/** Toggles the time and count blocks when the mode changes. */
function applyModeVisibility(): void {
  const single = currentMode() === 'single';
  frameEl<HTMLDivElement>('frameTimeBlock').hidden = !single;
  frameEl<HTMLDivElement>('frameCountBlock').hidden = single;
  renderFrameFile();
}

/** Wires selection, mode, time, capture, and folder opening. */
export function setupVideoFrameTool(): void {
  frameEl<HTMLButtonElement>('framePick').addEventListener('click', () => void chooseFrameFile());
  document.querySelectorAll<HTMLInputElement>('input[name="frameMode"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('#frameModes .mode-choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
    applyModeVisibility();
  }));
  document.querySelectorAll<HTMLInputElement>('input[name="frameCount"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('#frameCounts .choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
  }));
  frameEl<HTMLInputElement>('frameTime').addEventListener('input', () => renderFrameFile());
  frameEl<HTMLButtonElement>('frameRun').addEventListener('click', () => void captureFrames());
  frameEl<HTMLButtonElement>('frameOpenFolder').addEventListener('click', async () => {
    try { await VideoFrameService.OpenVideoFrameOutputFolder(); }
    catch (error) { frameError(error); }
  });
  applyModeVisibility();
}
