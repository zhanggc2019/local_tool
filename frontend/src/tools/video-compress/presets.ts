import { formatSize } from '../shared/format';

export { formatSize };

/** Compression presets mirrored from the Go service for the interface. */
export interface CompressPreset {
  id: string;
  label: string;
  hint: string;
}

export const COMPRESS_PRESETS: CompressPreset[] = [
  { id: 'half', label: '约一半', hint: '画质优先' },
  { id: 'third', label: '约三分之一', hint: '平衡' },
  { id: 'fifth', label: '约五分之一', hint: '体积优先' },
];

/** Summarizes the size change of one compressed video. */
export function describeCompression(inputBytes: number, outputBytes: number): string {
  if (inputBytes <= 0 || outputBytes <= 0) return '已完成';
  if (outputBytes >= inputBytes) return `${formatSize(inputBytes)} → ${formatSize(outputBytes)} · 未能减小体积`;
  const saved = Math.round((1 - outputBytes / inputBytes) * 100);
  return `${formatSize(inputBytes)} → ${formatSize(outputBytes)} · 节省 ${saved}%`;
}
