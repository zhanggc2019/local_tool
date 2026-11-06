/** Output size presets mirrored from the Go service (0 keeps the original). */
export const IMAGE_MAX_DIMENSIONS = [
  { value: 0, label: '原尺寸' },
  { value: 2000, label: '2000 px' },
  { value: 1400, label: '1400 px' },
  { value: 1000, label: '1000 px' },
] as const;

/** Output formats offered by the converter. */
export const IMAGE_FORMATS = [
  { value: 'jpeg', label: 'JPG', hint: '文件较小' },
  { value: 'png', label: 'PNG', hint: '保留透明' },
] as const;

export type ImageOutputFormat = (typeof IMAGE_FORMATS)[number]['value'];

/** Checks one format identifier from the interface. */
export function isImageFormat(value: string): value is ImageOutputFormat {
  return IMAGE_FORMATS.some((format) => format.value === value);
}
