import { VideoInfoService, type VideoInfo } from '../../../bindings/example.com/pdf-desktop/internal/app';
import { formatSize } from '../shared/format';
import { describeChannels, formatDurationMs, formatFPS, formatKbps, formatResolution } from './format';

/** Finds one required video info element. */
function infoEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少视频信息界面元素：${id}`);
  return node as T;
}

/** Displays one native or validation error using text content only. */
function infoError(error: unknown): void {
  const box = infoEl<HTMLDivElement>('infoError');
  box.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : '读取视频信息失败';
  box.hidden = false;
}

/** Renders one metadata row value. */
function setField(id: string, value: string): void {
  infoEl<HTMLElement>(id).textContent = value;
}

/** Shows the selected file card and every metadata field. */
function renderInfo(info: VideoInfo, sizeBytes: number): void {
  const card = infoEl<HTMLDivElement>('infoFile');
  card.replaceChildren();
  const name = document.createElement('strong');
  name.textContent = info.name;
  name.title = info.path;
  const detail = document.createElement('small');
  detail.textContent = `已读取 · ${formatSize(sizeBytes)}`;
  card.append(name, detail);
  card.hidden = false;

  setField('infoContainer', info.container || '—');
  setField('infoDuration', formatDurationMs(info.durationMs));
  setField('infoSize', formatSize(sizeBytes));
  setField('infoBitrate', formatKbps(info.bitrateKbps));
  setField('infoVideoCodec', info.videoCodec ? info.videoCodec.toUpperCase() : '—');
  setField('infoResolution', formatResolution(info.width, info.height));
  setField('infoFPS', formatFPS(info.fps));
  setField('infoVideoBitrate', formatKbps(info.videoBitrateKbps));
  setField('infoAudioCodec', info.audioCodec ? info.audioCodec.toUpperCase() : '无音轨');
  setField('infoSampleRate', info.sampleRate > 0 ? `${info.sampleRate} Hz` : '—');
  setField('infoChannels', describeChannels(info.channels));
  setField('infoAudioBitrate', formatKbps(info.audioBitrateKbps));
  infoEl<HTMLElement>('infoGrid').hidden = false;
  infoEl<HTMLElement>('infoHint').hidden = true;
}

/** Opens the native selector and probes the chosen video. */
async function chooseInfoVideo(): Promise<void> {
  infoEl<HTMLButtonElement>('infoPick').disabled = true;
  infoEl<HTMLDivElement>('infoError').hidden = true;
  const status = infoEl<HTMLDivElement>('infoStatus');
  status.textContent = '正在读取视频信息…';
  status.hidden = false;
  try {
    const info = await VideoInfoService.ChooseVideo();
    if (!info) return;
    renderInfo(info, info.bytes);
  } catch (error) {
    infoError(error);
  } finally {
    status.hidden = true;
    infoEl<HTMLButtonElement>('infoPick').disabled = false;
  }
}

/** Wires the single video picker. */
export function setupVideoInfoTool(): void {
  infoEl<HTMLButtonElement>('infoPick').addEventListener('click', () => void chooseInfoVideo());
}
