import { VolumeNormalizeService, type LocalSource } from '../../../bindings/example.com/pdf-desktop/internal/app';
import { formatSize } from '../shared/format';

let files: LocalSource[] = [];
let busy = false;

/** Finds one required volume element. */
function volumeEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少音量标准化界面元素：${id}`);
  return node as T;
}

/** Displays one native or validation error using text content only. */
function volumeError(error: unknown): void {
  const box = volumeEl<HTMLDivElement>('volumeError');
  box.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : '音量标准化失败';
  box.hidden = false;
}

/** Reads the selected output format. */
function currentFormat(): 'mp3' | 'wav' {
  return document.querySelector<HTMLInputElement>('input[name="volumeFormat"]:checked')?.value === 'wav' ? 'wav' : 'mp3';
}

/** Updates the visible file queue and enabled controls. */
function renderVolumeFiles(states: Map<number, string> = new Map()): void {
  const list = volumeEl<HTMLOListElement>('volumeFiles');
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
  volumeEl<HTMLDivElement>('volumeEmpty').hidden = files.length > 0;
  volumeEl<HTMLButtonElement>('volumeRun').disabled = busy || !files.length;
}

/** Opens the native selector in single or multiple mode. */
async function chooseVolumeFiles(): Promise<void> {
  if (busy) return;
  volumeEl<HTMLDivElement>('volumeError').hidden = true;
  try {
    const selected = await VolumeNormalizeService.ChooseAudios(volumeEl<HTMLInputElement>('volumeBatch').checked);
    if (!selected?.length) return;
    files = selected;
    volumeEl<HTMLDivElement>('volumeResult').hidden = true;
    renderVolumeFiles();
  } catch (error) { volumeError(error); }
}

/** Normalizes selected audio files sequentially. */
async function normalizeAudios(): Promise<void> {
  if (busy || !files.length) return;
  const format = currentFormat();
  busy = true;
  volumeEl<HTMLButtonElement>('volumePick').disabled = true;
  volumeEl<HTMLInputElement>('volumeBatch').disabled = true;
  volumeEl<HTMLDivElement>('volumeError').hidden = true;
  volumeEl<HTMLDivElement>('volumeResult').hidden = true;
  const status = volumeEl<HTMLDivElement>('volumeStatus');
  const states = new Map<number, string>();
  const failures: string[] = [];
  let successes = 0;
  let lastPath = '';
  try {
    for (let index = 0; index < files.length; index++) {
      status.textContent = `正在处理 ${index + 1} / ${files.length}：${files[index].name}`;
      status.hidden = false;
      states.set(index, '处理中…');
      renderVolumeFiles(states);
      try {
        const result = await VolumeNormalizeService.NormalizeAudio(index, format);
        successes++;
        lastPath = result.path;
        states.set(index, `已保存 ${format.toUpperCase()} · ${formatSize(result.bytes)}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        states.set(index, `失败：${message}`);
        failures.push(`${files[index].name}：${message}`);
      }
      renderVolumeFiles(states);
    }
    if (successes) {
      volumeEl<HTMLElement>('volumeResultTitle').textContent = `已处理 ${successes} / ${files.length} 个音频`;
      volumeEl<HTMLElement>('volumeResultPath').textContent = files.length === 1 ? lastPath : '结果保存在各音频所在文件夹';
      volumeEl<HTMLDivElement>('volumeResult').hidden = false;
    }
    if (failures.length) volumeError(`未完成 ${failures.length} 个：${failures.join('；')}`);
  } finally {
    busy = false;
    status.hidden = true;
    volumeEl<HTMLButtonElement>('volumePick').disabled = false;
    volumeEl<HTMLInputElement>('volumeBatch').disabled = false;
    renderVolumeFiles(states);
  }
}

/** Wires selection, format, normalization, and folder opening. */
export function setupVolumeNormalizeTool(): void {
  volumeEl<HTMLButtonElement>('volumePick').addEventListener('click', () => void chooseVolumeFiles());
  volumeEl<HTMLInputElement>('volumeBatch').addEventListener('change', () => {
    files = [];
    volumeEl<HTMLDivElement>('volumeResult').hidden = true;
    volumeEl<HTMLDivElement>('volumeError').hidden = true;
    volumeEl<HTMLButtonElement>('volumePick').textContent = volumeEl<HTMLInputElement>('volumeBatch').checked ? '选择多个音频' : '选择音频';
    renderVolumeFiles();
  });
  document.querySelectorAll<HTMLInputElement>('input[name="volumeFormat"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('.volume-formats .format-choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
  }));
  volumeEl<HTMLButtonElement>('volumeRun').addEventListener('click', () => void normalizeAudios());
  volumeEl<HTMLButtonElement>('volumeOpenFolder').addEventListener('click', async () => {
    try { await VolumeNormalizeService.OpenVolumeOutputFolder(); }
    catch (error) { volumeError(error); }
  });
  renderVolumeFiles();
}
