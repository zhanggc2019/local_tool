export type ExportMode = 'single' | 'split';
export type ImageFormat = 'jpeg' | 'png';
export interface PageSize { width: number; height: number }
export interface ImageLayout { width: number; height: number; pageHeights: number[]; gap: number }

const MAX_PIXELS = 20_000_000;
const MAX_SIDE = 16_000;
const MIN_WIDTH = 320;
const PAGE_GAP = 12;

/** Calculates bounded output dimensions before any canvas is allocated. */
export function planLayout(pages: PageSize[], desiredWidth: number, mode: ExportMode): ImageLayout {
  if (pages.length === 0 || pages.some((page) => !Number.isFinite(page.width) || !Number.isFinite(page.height) || page.width <= 0 || page.height <= 0)) {
    throw new Error('PDF 页面尺寸无效');
  }
  if (!Number.isInteger(desiredWidth) || desiredWidth < MIN_WIDTH || desiredWidth > 2000) {
    throw new Error('请选择有效的图片尺寸');
  }
  const ratios = pages.map((page) => page.height / page.width);
  const gap = mode === 'single' && pages.length > 1 ? PAGE_GAP : 0;
  const relevant = mode === 'single' ? ratios : [Math.max(...ratios)];
  let width = desiredWidth;
  while (width >= MIN_WIDTH) {
    const heights = relevant.map((ratio) => Math.max(1, Math.round(width * ratio)));
    const totalHeight = heights.reduce((sum, height) => sum + height, 0) + gap * (heights.length - 1);
    if (width <= MAX_SIDE && totalHeight <= MAX_SIDE && width * totalHeight <= MAX_PIXELS) {
      const pageHeights = ratios.map((ratio) => Math.max(1, Math.round(width * ratio)));
      return { width, height: mode === 'single' ? totalHeight : Math.max(...pageHeights), pageHeights, gap };
    }
    width -= Math.max(1, Math.floor(width / 50));
  }
  throw new Error('合成长图会过大，请改用“按页导出多张”');
}
