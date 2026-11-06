import { VideoMergeService, type LocalSource } from '../../../bindings/example.com/pdf-desktop/internal/app';
import { formatSize } from '../shared/format';
import { isMergeMode, type MergeMode } from './options';

let files: LocalSource[] = [];
let order: number[] = [];
let busy = false;

/** Finds one required video merge element. */
function mergeEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少视频合并界面元素：${id}`);
  return node as T;
}

/** Displays one native or validation error using text content only. */
function mergeError(error: unknown): void {
  const box = mergeEl<HTMLDivElement>('mergeError');
  box.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : '视频合并失败';
  box.hidden = false;
}

/** Reads the active merge mode. */
function currentMode(): MergeMode {
  const value = document.querySelector<HTMLInputElement>('input[name="mergeMode"]:checked')?.value ?? 'fast';
  return isMergeMode(value) ? value : 'fast';
}

/** Updates the ordered list with move buttons. */
function renderMergeFiles(): void {
  const list = mergeEl<HTMLOListElement>('mergeFiles');
  list.replaceChildren();
  order.forEach((fileIndex, position) => {
    const file = files[fileIndex];
    const item = document.createElement('li');
    item.className = 'video-file image-pdf-item';
    const copy = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = file.name;
    name.title = file.path;
    const detail = document.createElement('small');
    detail.textContent = `第 ${position + 1} 段 · ${formatSize(file.bytes)}`;
    copy.append(name, detail);
    const moves = document.createElement('div');
    moves.className = 'image-pdf-moves';
    const up = document.createElement('button');
    up.type = 'button';
    up.textContent = '上移';
    up.disabled = position === 0;
    up.addEventListener('click', () => {
      [order[position - 1], order[position]] = [order[position], order[position - 1]];
      renderMergeFiles();
    });
    const down = document.createElement('button');
    down.type = 'button';
    down.textContent = '下移';
    down.disabled = position === order.length - 1;
    down.addEventListener('click', () => {
      [order[position + 1], order[position]] = [order[position], order[position + 1]];
      renderMergeFiles();
    });
    moves.append(up, down);
    item.append(copy, moves);
    list.append(item);
  });
  list.hidden = files.length === 0;
  mergeEl<HTMLDivElement>('mergeEmpty').hidden = files.length > 0;
  mergeEl<HTMLButtonElement>('mergeRun').disabled = busy || files.length < 2;
}

/** Opens the native selector and stores the selection in pick order. */
async function chooseMergeFiles(): Promise<void> {
  if (busy) return;
  mergeEl<HTMLDivElement>('mergeError').hidden = true;
  try {
    const selected = await VideoMergeService.ChooseVideos(true);
    if (!selected?.length) return;
    files = selected;
    order = files.map((_, index) => index);
    mergeEl<HTMLDivElement>('mergeResult').hidden = true;
    renderMergeFiles();
  } catch (error) { mergeError(error); }
}

/** Joins the ordered videos into one file. */
async function runMerge(): Promise<void> {
  if (busy || files.length < 2) return;
  const mode = currentMode();
  busy = true;
  renderMergeFiles();
  mergeEl<HTMLButtonElement>('mergePick').disabled = true;
  mergeEl<HTMLDivElement>('mergeError').hidden = true;
  mergeEl<HTMLDivElement>('mergeResult').hidden = true;
  const status = mergeEl<HTMLDivElement>('mergeStatus');
  status.textContent = mode === 'fast' ? '正在快速合并…' : '正在兼容合并，可能需要较长时间…';
  status.hidden = false;
  try {
    const result = await VideoMergeService.MergeVideos(order, mode);
    mergeEl<HTMLElement>('mergeResultTitle').textContent = `已合并 ${files.length} 个视频 · ${formatSize(result.bytes)}`;
    mergeEl<HTMLElement>('mergeResultPath').textContent = result.path;
    mergeEl<HTMLDivElement>('mergeResult').hidden = false;
  } catch (error) {
    mergeError(error);
  } finally {
    busy = false;
    status.hidden = true;
    mergeEl<HTMLButtonElement>('mergePick').disabled = false;
    renderMergeFiles();
  }
}

/** Wires selection, ordering, mode, merging, and folder opening. */
export function setupVideoMergeTool(): void {
  mergeEl<HTMLButtonElement>('mergePick').addEventListener('click', () => void chooseMergeFiles());
  document.querySelectorAll<HTMLInputElement>('input[name="mergeMode"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('#mergeModes .mode-choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
  }));
  mergeEl<HTMLButtonElement>('mergeRun').addEventListener('click', () => void runMerge());
  mergeEl<HTMLButtonElement>('mergeOpenFolder').addEventListener('click', async () => {
    try { await VideoMergeService.OpenVideoMergeOutputFolder(); }
    catch (error) { mergeError(error); }
  });
  renderMergeFiles();
}
