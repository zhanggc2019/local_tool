import { VideoAudioService, type LocalSource } from '../../../bindings/example.com/pdf-desktop';

let files: LocalSource[] = [];
let busy = false;

/** Finds one required video extraction element. */
function videoEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少视频转音频界面元素：${id}`);
  return node as T;
}

/** Formats a source file size for the batch queue. */
function videoSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Displays one native or validation error using text content only. */
function videoError(error: unknown): void {
  const box = videoEl<HTMLDivElement>('videoError');
  box.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : '视频提取失败';
  box.hidden = false;
}

/** Updates the visible file queue and enabled processing controls. */
function renderVideoFiles(states: Map<number, string> = new Map()): void {
  const list = videoEl<HTMLOListElement>('videoFiles');
  list.replaceChildren();
  files.forEach((file, index) => {
    const item = document.createElement('li');
    item.className = 'video-file';
    const copy = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = file.name;
    name.title = file.path;
    const detail = document.createElement('small');
    detail.textContent = `${videoSize(file.bytes)} · ${states.get(index) ?? '等待提取'}`;
    copy.append(name, detail);
    item.append(copy);
    list.append(item);
  });
  list.hidden = files.length === 0;
  videoEl<HTMLDivElement>('videoEmpty').hidden = files.length > 0;
  videoEl<HTMLButtonElement>('videoRun').disabled = busy || !files.length;
}

/** Opens the native selector in single or multiple mode. */
async function chooseVideoFiles(): Promise<void> {
  if (busy) return;
  videoEl<HTMLDivElement>('videoError').hidden = true;
  try {
    const selected = await VideoAudioService.ChooseVideos(videoEl<HTMLInputElement>('videoBatch').checked);
    if (!selected?.length) return;
    files = selected;
    videoEl<HTMLDivElement>('videoResult').hidden = true;
    renderVideoFiles();
  } catch (error) { videoError(error); }
}

/** Extracts selected videos sequentially so one failure does not stop the batch. */
async function extractVideos(): Promise<void> {
  if (busy || !files.length) return;
  busy = true;
  videoEl<HTMLButtonElement>('videoPick').disabled = true;
  videoEl<HTMLInputElement>('videoBatch').disabled = true;
  document.querySelectorAll<HTMLInputElement>('input[name="videoAudioFormat"]').forEach((input) => { input.disabled = true; });
  videoEl<HTMLDivElement>('videoError').hidden = true;
  videoEl<HTMLDivElement>('videoResult').hidden = true;
  const status = videoEl<HTMLDivElement>('videoStatus');
  const states = new Map<number, string>();
  const failures: string[] = [];
  let successes = 0;
  let lastPath = '';
  const format = document.querySelector<HTMLInputElement>('input[name="videoAudioFormat"]:checked')?.value ?? 'mp3';
  try {
    for (let index = 0; index < files.length; index++) {
      status.textContent = `正在提取 ${index + 1} / ${files.length}：${files[index].name}`;
      status.hidden = false;
      states.set(index, '处理中…');
      renderVideoFiles(states);
      try {
        const result = await VideoAudioService.ExtractVideoAudio(index, format);
        successes++;
        lastPath = result.path;
        states.set(index, `已保存 ${format.toUpperCase()} · ${videoSize(result.bytes)}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        states.set(index, `失败：${message}`);
        failures.push(`${files[index].name}：${message}`);
      }
      renderVideoFiles(states);
    }
    if (successes) {
      videoEl<HTMLElement>('videoResultTitle').textContent = `已提取 ${successes} / ${files.length} 个视频`;
      videoEl<HTMLElement>('videoResultPath').textContent = files.length === 1 ? lastPath : '结果保存在各视频所在文件夹';
      videoEl<HTMLDivElement>('videoResult').hidden = false;
    }
    if (failures.length) videoError(`未完成 ${failures.length} 个：${failures.join('；')}`);
  } finally {
    busy = false;
    status.hidden = true;
    videoEl<HTMLButtonElement>('videoPick').disabled = false;
    videoEl<HTMLInputElement>('videoBatch').disabled = false;
    document.querySelectorAll<HTMLInputElement>('input[name="videoAudioFormat"]').forEach((input) => { input.disabled = false; });
    renderVideoFiles(states);
  }
}

/** Wires batch selection, output format, conversion, and folder opening. */
export function setupVideoAudioTool(): void {
  videoEl<HTMLButtonElement>('videoPick').addEventListener('click', () => void chooseVideoFiles());
  videoEl<HTMLInputElement>('videoBatch').addEventListener('change', () => {
    files = [];
    videoEl<HTMLDivElement>('videoResult').hidden = true;
    videoEl<HTMLDivElement>('videoError').hidden = true;
    videoEl<HTMLButtonElement>('videoPick').textContent = videoEl<HTMLInputElement>('videoBatch').checked ? '选择多个视频' : '选择视频';
    renderVideoFiles();
  });
  document.querySelectorAll<HTMLInputElement>('input[name="videoAudioFormat"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('.video-formats .format-choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
  }));
  videoEl<HTMLButtonElement>('videoRun').addEventListener('click', () => void extractVideos());
  videoEl<HTMLButtonElement>('videoOpenFolder').addEventListener('click', async () => {
    try { await VideoAudioService.OpenVideoOutputFolder(); }
    catch (error) { videoError(error); }
  });
  renderVideoFiles();
}
