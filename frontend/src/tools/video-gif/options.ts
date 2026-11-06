/** GIF export options mirrored from the Go service for the interface. */
export interface GIFChoice { value: number; label: string }

export const GIF_WIDTHS: GIFChoice[] = [
  { value: 320, label: '小 320' },
  { value: 480, label: '中 480' },
  { value: 640, label: '大 640' },
];

export const GIF_FPS: GIFChoice[] = [
  { value: 10, label: '流畅 10' },
  { value: 15, label: '标准 15' },
  { value: 24, label: '高帧 24' },
];

/** Formats one GIF size for the result panel. */
export function formatGIFSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
