/** Frame capture counts mirrored from the Go service for the interface. */
export const FRAME_COUNTS = [4, 6, 9, 12] as const;

/** Frame capture modes offered by the interface. */
export const FRAME_MODES = [
  { value: 'single', label: '指定时间点', hint: '截取一帧作为封面' },
  { value: 'spread', label: '均分多张', hint: '整段视频均匀取帧' },
] as const;

export type FrameMode = (typeof FRAME_MODES)[number]['value'];

/** Checks one mode identifier from the interface. */
export function isFrameMode(value: string): value is FrameMode {
  return FRAME_MODES.some((mode) => mode.value === value);
}
