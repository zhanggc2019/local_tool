/** Formats milliseconds as h:mm:ss or m:ss. */
export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Formats a kilobyte-per-second bitrate. */
export function formatKbps(kbps: number): string {
  if (!Number.isFinite(kbps) || kbps <= 0) return '—';
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(2)} Mbps`;
  return `${Math.round(kbps)} kbps`;
}

/** Translates FFmpeg channel layouts. */
export function describeChannels(channels: string): string {
  switch (channels) {
    case 'mono': return '单声道';
    case 'stereo': return '立体声';
    case '': return '—';
    default: return channels.replace(' channels', ' 声道');
  }
}

/** Formats a frame rate without noisy decimals. */
export function formatFPS(fps: number): string {
  if (!Number.isFinite(fps) || fps <= 0) return '—';
  return `${Number.isInteger(fps) ? fps : fps.toFixed(2)} fps`;
}

/** Joins resolution into one label. */
export function formatResolution(width: number, height: number): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '—';
  return `${width} × ${height}`;
}
