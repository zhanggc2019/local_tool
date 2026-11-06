/** Output container presets mirrored from the Go service. */
export const VIDEO_TARGETS = [
  { value: 'mp4', label: 'MP4', hint: 'H.264 + AAC · 兼容性最好' },
  { value: 'mkv', label: 'MKV', hint: '直接复制流 · 无损且快' },
  { value: 'webm', label: 'WebM', hint: 'VP9 + Opus · 转码较慢' },
] as const;

export type VideoTarget = (typeof VIDEO_TARGETS)[number]['value'];

/** Checks one container identifier from the interface. */
export function isVideoTarget(value: string): value is VideoTarget {
  return VIDEO_TARGETS.some((target) => target.value === value);
}
