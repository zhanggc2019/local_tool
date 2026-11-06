/** Formats one file size for display. */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Summarizes a completed size change honestly, including no improvement. */
export function describeChange(inputBytes: number, outputBytes: number): string {
  if (inputBytes <= 0 || outputBytes <= 0) return '已完成';
  if (outputBytes >= inputBytes) return `${formatSize(inputBytes)} → ${formatSize(outputBytes)} · 未能减小体积`;
  const saved = Math.round((1 - outputBytes / inputBytes) * 100);
  return `${formatSize(inputBytes)} → ${formatSize(outputBytes)} · 节省 ${saved}%`;
}
