/** Watermark color presets shared by the view and the UI wiring. */
export const WATERMARK_COLORS = [
  { value: '#808080', label: '灰' },
  { value: '#c0392b', label: '红' },
  { value: '#245fae', label: '蓝' },
  { value: '#333333', label: '黑' },
] as const;

/** Clamps a slider value into the inclusive range. */
export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Describes the effective watermark appearance for the hint line. */
export function describeWatermark(text: string, fontSize: number, opacity: number, rotation: number): string {
  const trimmed = text.trim();
  if (!trimmed) return '请输入水印文字';
  return `“${trimmed}” · ${fontSize} pt · ${opacity}% 不透明 · ${rotation}°`;
}
