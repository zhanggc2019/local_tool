import { AudioDenoiseService, type LocalSource, type AudioResult } from '../../../bindings/example.com/pdf-desktop/internal/app';
import { sourceSampleRate, type AudioStats } from './metadata';

const PCM_CHUNK = 512 * 1024;
const FILE_CHUNK = 2 * 1024 * 1024;
const MP3_CHUNK = 512 * 1024;
let selected: LocalSource | null = null;
let originalBlob: Blob | null = null;
let originalURL = '';
let processedURL = '';
let busy = false;

/** Returns one required audio tool element. */
function audioEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少音频界面元素：${id}`);
  return node as T;
}

/** Formats byte counts for source and result labels. */
function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Formats an audio duration as minutes and seconds. */
function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

/** Renders source or result audio properties as a compact definition grid. */
function renderAudioStats(id: string, stats: AudioStats | null): void {
  const container = audioEl<HTMLDivElement>(id);
  container.replaceChildren();
  if (!stats) {
    const empty = document.createElement('span');
    empty.textContent = id === 'audioOriginalParams' ? '选择文件后显示音频参数' : '处理完成后显示音频参数';
    container.append(empty);
    return;
  }
  const entries = [
    ['格式', stats.format],
    ['采样率', stats.sampleRate ? `${(stats.sampleRate / 1000).toFixed(1)} kHz` : '未识别'],
    ['时长', formatDuration(stats.duration)],
    ['声道', stats.channels === 1 ? '单声道' : stats.channels === 2 ? '双声道' : `${stats.channels} 声道`],
    ['文件大小', formatBytes(stats.bytes)],
  ];
  for (const [label, value] of entries) {
    const row = document.createElement('div');
    row.className = 'audio-param';
    const key = document.createElement('small');
    key.textContent = label;
    const text = document.createElement('strong');
    text.textContent = value;
    row.append(key, text);
    container.append(row);
  }
}

/** Shows a readable error without inserting untrusted HTML. */
function showAudioError(error: unknown): void {
  const box = audioEl<HTMLDivElement>('audioError');
  box.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : '音频处理失败';
  box.hidden = false;
}

/** Replaces one preview object URL and releases the previous one. */
function setPreview(id: string, value: Blob | null): void {
  const player = audioEl<HTMLAudioElement>(id);
  player.pause();
  const previous = id === 'audioOriginal' ? originalURL : processedURL;
  if (previous) URL.revokeObjectURL(previous);
  const next = value ? URL.createObjectURL(value) : '';
  if (id === 'audioOriginal') originalURL = next;
  else processedURL = next;
  if (next) player.src = next;
  else player.removeAttribute('src');
  player.load();
}

/** Loads a local file through bounded Wails calls into a browser File. */
async function readAudioFile(bytes: number, source: boolean): Promise<Blob> {
  const chunks: BlobPart[] = [];
  for (let offset = 0; offset < bytes; offset += FILE_CHUNK) {
    const encoded = source ? await AudioDenoiseService.ReadAudioChunk(offset) : await AudioDenoiseService.ReadResultChunk(offset);
    const decoded = atob(encoded);
    const data = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index++) data[index] = decoded.charCodeAt(index);
    chunks.push(data.buffer);
  }
  const ext = selected?.name.split('.').pop()?.toLowerCase();
  const type = source ? ext === 'mp3' ? 'audio/mpeg' : ext === 'm4a' ? 'audio/mp4' : 'audio/wav' : 'audio/wav';
  return new Blob(chunks, { type });
}

/** Decodes common audio formats and resamples them to DeepFilterNet3's 48 kHz input. */
async function normalizeAudio(file: Blob): Promise<AudioBuffer> {
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(await file.arrayBuffer());
  } finally {
    await context.close();
  }
  if (!Number.isFinite(decoded.duration) || decoded.duration <= 0 || decoded.duration > 600) throw new Error('音频时长需在 10 分钟以内');
  const channels = Math.min(decoded.numberOfChannels, 2);
  const frames = Math.ceil(decoded.duration * 48000);
  const offline = new OfflineAudioContext(channels, frames, 48000);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  return offline.startRendering();
}

/** Decodes the selected source to report its actual sample rate and duration. */
async function inspectOriginal(file: Blob, name: string): Promise<AudioStats> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    return { format: name.split('.').pop()?.toUpperCase() ?? '音频', sampleRate: await sourceSampleRate(file, name), duration: decoded.duration, channels: decoded.numberOfChannels, bytes: file.size };
  } finally {
    await context.close();
  }
}

/** Reads the generated PCM WAV header to show output properties accurately. */
async function inspectProcessed(file: Blob): Promise<AudioStats> {
  const header = new DataView(await file.slice(0, 4096).arrayBuffer());
  if (header.byteLength < 44 || header.getUint32(0, false) !== 0x52494646 || header.getUint32(8, false) !== 0x57415645) throw new Error('降噪结果不是有效的 WAV 文件');
  let sampleRate = 0;
  let channels = 0;
  let byteRate = 0;
  let dataBytes = 0;
  for (let offset = 12; offset + 8 <= header.byteLength;) {
    const tag = header.getUint32(offset, false);
    const size = header.getUint32(offset + 4, true);
    if (tag === 0x666d7420 && offset + 24 <= header.byteLength) {
      channels = header.getUint16(offset + 10, true);
      sampleRate = header.getUint32(offset + 12, true);
      byteRate = header.getUint32(offset + 16, true);
    }
    if (tag === 0x64617461) { dataBytes = size; break; }
    offset += 8 + size + (size % 2);
  }
  if (!sampleRate || !channels || !byteRate || !dataBytes) throw new Error('无法读取降噪结果的音频参数');
  return { format: 'WAV · PCM', sampleRate, channels, duration: dataBytes / byteRate, bytes: file.size };
}

/** Encodes one interleaved PCM16 chunk as Base64 for the Go service. */
function encodePCM(buffer: AudioBuffer, start: number, frames: number): string {
  const channels = buffer.numberOfChannels;
  const output = new Uint8Array(frames * channels * 2);
  const view = new DataView(output.buffer);
  const samples = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  let index = 0;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const value = Math.max(-1, Math.min(1, samples[channel][start + frame]));
      view.setInt16(index, value < 0 ? Math.round(value * 32768) : Math.round(value * 32767), true);
      index += 2;
    }
  }
  const pieces: string[] = [];
  for (let offset = 0; offset < output.length; offset += 8192) pieces.push(String.fromCharCode(...Array.from(output.subarray(offset, offset + 8192))));
  return btoa(pieces.join(''));
}

/** Encodes one byte slice as Base64 for the bounded MP3 upload. */
function encodeBytes(bytes: Uint8Array): string {
  const pieces: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) pieces.push(String.fromCharCode(...Array.from(bytes.subarray(offset, offset + 8192))));
  return btoa(pieces.join(''));
}

/** Runs the MP3 encoder in a worker and reports its progress. */
async function encodeMP3(wav: Blob): Promise<Uint8Array> {
  const data = await wav.arrayBuffer();
  return new Promise<Uint8Array>((resolve, reject) => {
    const worker = new Worker(new URL('./mp3.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ kind: string; percent?: number; bytes?: ArrayBuffer; message?: string }>) => {
      if (event.data.kind === 'progress') { setAudioStatus(`正在编码 MP3… ${event.data.percent ?? 0}%`); return; }
      worker.terminate();
      if (event.data.kind === 'done' && event.data.bytes) resolve(new Uint8Array(event.data.bytes));
      else reject(new Error(event.data.message || 'MP3 编码失败'));
    };
    worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message || 'MP3 编码失败')); };
    worker.postMessage({ wav: data }, [data]);
  });
}

/** Sends the encoded MP3 to Go and replaces the temporary WAV output. */
async function saveMP3(bytes: Uint8Array): Promise<AudioResult> {
  await AudioDenoiseService.BeginMP3(bytes.length);
  try {
    for (let offset = 0; offset < bytes.length; offset += MP3_CHUNK) {
      await AudioDenoiseService.AppendMP3(encodeBytes(bytes.subarray(offset, offset + MP3_CHUNK)));
      setAudioStatus(`正在保存 MP3… ${Math.round(100 * Math.min(bytes.length, offset + MP3_CHUNK) / bytes.length)}%`);
    }
    return await AudioDenoiseService.FinishMP3();
  } catch (error) {
    try { await AudioDenoiseService.CancelMP3(); } catch { /* Keep the original save error. */ }
    throw error;
  }
}

/** Updates the short task message while decoding, uploading, and filtering. */
function setAudioStatus(message: string): void {
  const status = audioEl<HTMLDivElement>('audioStatus');
  status.textContent = message;
  status.hidden = !message;
}

/** Updates the strength label and highlights the matching scene shortcut. */
function updateStrength(): void {
  const value = Number(audioEl<HTMLInputElement>('audioStrength').value);
  audioEl<HTMLElement>('audioStrengthValue').textContent = `${value} / 100`;
  document.querySelectorAll<HTMLButtonElement>('.audio-presets button').forEach((button) => button.classList.toggle('selected', Number(button.dataset.strength) === value));
  const hint = value === 0 ? '0 表示不施加降噪，用于试听对照。' : value < 40 ? '轻度处理，适合较安静的人声录音。' : value < 65 ? '压低持续性环境杂音，适合办公室录音。' : value < 85 ? '加强压制背景噪声，建议检查人声自然度。' : '启用后置滤波，噪声更低，也更可能影响人声细节。';
  audioEl<HTMLElement>('audioStrengthHint').textContent = `${hint} 数值是试听起点，可按录音调整。`;
}

/** Opens the native picker and loads the original preview. */
async function pickAudio(): Promise<void> {
  if (busy) return;
  audioEl<HTMLDivElement>('audioError').hidden = true;
  busy = true;
  audioEl<HTMLButtonElement>('audioPick').disabled = true;
  audioEl<HTMLButtonElement>('audioRun').disabled = true;
  try {
    const picked = await AudioDenoiseService.ChooseAudio();
    if (!picked?.path) return;
    selected = picked;
    originalBlob = null;
    setPreview('audioOriginal', null);
    setPreview('audioProcessed', null);
    renderAudioStats('audioOriginalParams', null);
    renderAudioStats('audioProcessedParams', null);
    audioEl<HTMLDivElement>('audioResult').hidden = true;
    audioEl<HTMLElement>('audioResultLabel').textContent = '等待处理';
    audioEl<HTMLElement>('audioFileName').textContent = picked.name;
    audioEl<HTMLElement>('audioFileMeta').textContent = `${formatBytes(picked.bytes)} · 原文件保留`;
    setAudioStatus('正在读取原始音频…');
    const file = await readAudioFile(picked.bytes, true);
    renderAudioStats('audioOriginalParams', await inspectOriginal(file, picked.name));
    originalBlob = file;
    setPreview('audioOriginal', file);
  } catch (error) {
    showAudioError(error);
  } finally {
    busy = false;
    setAudioStatus('');
    audioEl<HTMLButtonElement>('audioPick').disabled = false;
    audioEl<HTMLButtonElement>('audioRun').disabled = !selected || !originalURL;
  }
}

/** Uploads normalized PCM, runs the model, and loads the saved comparison preview. */
async function denoise(): Promise<void> {
  if (busy || !selected || !originalBlob) return;
  busy = true;
  audioEl<HTMLButtonElement>('audioPick').disabled = true;
  audioEl<HTMLButtonElement>('audioRun').disabled = true;
  audioEl<HTMLInputElement>('audioStrength').disabled = true;
  document.querySelectorAll<HTMLButtonElement>('.audio-presets button').forEach((button) => { button.disabled = true; });
  audioEl<HTMLDivElement>('audioError').hidden = true;
  audioEl<HTMLDivElement>('audioResult').hidden = true;
  document.querySelectorAll<HTMLInputElement>('input[name="audioFormat"]').forEach((radio) => { radio.disabled = true; });
  setPreview('audioProcessed', null);
  renderAudioStats('audioProcessedParams', null);
  let fallbackWav: AudioResult | null = null;
  let fallbackBlob: Blob | null = null;
  let fallbackStats: AudioStats | null = null;
  try {
    setAudioStatus('正在解码并转换为 48 kHz…');
    const buffer = await normalizeAudio(originalBlob);
    const strength = Number(audioEl<HTMLInputElement>('audioStrength').value);
    const format = document.querySelector<HTMLInputElement>('input[name="audioFormat"]:checked')?.value ?? 'wav';
    await AudioDenoiseService.BeginAudio(buffer.length, buffer.numberOfChannels, strength);
    const framesPerChunk = Math.floor(PCM_CHUNK / (buffer.numberOfChannels * 2));
    for (let offset = 0; offset < buffer.length; offset += framesPerChunk) {
      const frames = Math.min(framesPerChunk, buffer.length - offset);
      await AudioDenoiseService.AppendAudio(encodePCM(buffer, offset, frames));
      setAudioStatus(`正在准备音频… ${Math.round(100 * (offset + frames) / buffer.length)}%`);
    }
    setAudioStatus('DeepFilterNet3 正在 CPU 上降噪，请稍候…');
    let result: AudioResult = await AudioDenoiseService.FinishAudio();
    fallbackWav = result;
    setAudioStatus('正在加载降噪结果…');
    const wav = await readAudioFile(result.bytes, false);
    const wavStats = await inspectProcessed(wav);
    fallbackBlob = wav;
    fallbackStats = wavStats;
    let preview: Blob = wav;
    let stats = wavStats;
    if (format === 'mp3') {
      setAudioStatus('正在编码 MP3…');
      const encoded = await encodeMP3(wav);
      result = await saveMP3(encoded);
      fallbackWav = null;
      preview = new Blob([encoded.buffer as ArrayBuffer], { type: 'audio/mpeg' });
      stats = { ...wavStats, format: 'MP3 · 192 kbps', bytes: result.bytes };
    }
    renderAudioStats('audioProcessedParams', stats);
    setPreview('audioProcessed', preview);
    audioEl<HTMLElement>('audioResultLabel').textContent = `${formatBytes(result.bytes)} · 强度 ${strength}`;
    audioEl<HTMLElement>('audioResultPath').textContent = result.path;
    audioEl<HTMLDivElement>('audioResult').hidden = false;
  } catch (error) {
    try { await AudioDenoiseService.CancelAudio(); } catch { /* Preserve the processing error. */ }
    try { await AudioDenoiseService.CancelMP3(); } catch { /* Preserve the processing error. */ }
    if (fallbackWav) {
      if (fallbackBlob && fallbackStats) { renderAudioStats('audioProcessedParams', fallbackStats); setPreview('audioProcessed', fallbackBlob); }
      audioEl<HTMLElement>('audioResultLabel').textContent = 'WAV 已保留';
      audioEl<HTMLElement>('audioResultPath').textContent = fallbackWav.path;
      audioEl<HTMLDivElement>('audioResult').hidden = false;
      const message = error instanceof Error ? error.message : String(error);
      showAudioError(`MP3 输出未完成，WAV 已保留：${message}`);
    } else showAudioError(error);
  } finally {
    busy = false;
    setAudioStatus('');
    audioEl<HTMLButtonElement>('audioPick').disabled = false;
    audioEl<HTMLButtonElement>('audioRun').disabled = !selected || !originalURL;
    audioEl<HTMLInputElement>('audioStrength').disabled = false;
    document.querySelectorAll<HTMLButtonElement>('.audio-presets button').forEach((button) => { button.disabled = false; });
    document.querySelectorAll<HTMLInputElement>('input[name="audioFormat"]').forEach((radio) => { radio.disabled = false; });
  }
}

/** Connects selection, strength, playback, processing, and output folder controls. */
export function setupAudioDenoiseTool(): void {
  audioEl<HTMLButtonElement>('audioPick').addEventListener('click', () => void pickAudio());
  audioEl<HTMLButtonElement>('audioRun').addEventListener('click', () => void denoise());
  audioEl<HTMLInputElement>('audioStrength').addEventListener('input', updateStrength);
  document.querySelectorAll<HTMLInputElement>('input[name="audioFormat"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('.audio-format-choices .format-choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
  }));
  document.querySelectorAll<HTMLButtonElement>('.audio-presets button').forEach((button) => button.addEventListener('click', () => {
    audioEl<HTMLInputElement>('audioStrength').value = button.dataset.strength ?? '50';
    updateStrength();
  }));
  const original = audioEl<HTMLAudioElement>('audioOriginal');
  const processed = audioEl<HTMLAudioElement>('audioProcessed');
  original.addEventListener('play', () => { if (!processed.paused) { processed.pause(); original.currentTime = Math.min(processed.currentTime, original.duration || 0); } });
  processed.addEventListener('play', () => { if (!original.paused) { original.pause(); processed.currentTime = Math.min(original.currentTime, processed.duration || 0); } });
  audioEl<HTMLButtonElement>('audioOpenFolder').addEventListener('click', async () => {
    try { await AudioDenoiseService.OpenAudioOutputFolder(); }
    catch (error) { showAudioError(error); }
  });
}
