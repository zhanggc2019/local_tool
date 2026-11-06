/** Merge strategies mirrored from the Go service. */
export const MERGE_MODES = [
  { value: 'fast', label: '快速合并', hint: '直接复制流 · 快且无损' },
  { value: 'precise', label: '兼容合并', hint: '重新编码 · 允许参数不一致' },
] as const;

export type MergeMode = (typeof MERGE_MODES)[number]['value'];

/** Checks one merge mode identifier from the interface. */
export function isMergeMode(value: string): value is MergeMode {
  return MERGE_MODES.some((mode) => mode.value === value);
}
