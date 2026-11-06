export interface ImageSize { width: number; height: number }

export interface StitchPlan {
  width: number;
  totalHeight: number;
  scaled: ImageSize[];
  gap: number;
}

export const STITCH_TARGET_WIDTHS = [
  { value: 0, label: '原图最大宽度' },
  { value: 1080, label: '1080 px' },
  { value: 750, label: '750 px' },
  { value: 640, label: '640 px' },
] as const;

export const STITCH_GAPS = [
  { value: 0, label: '无间距' },
  { value: 8, label: '8 px' },
  { value: 16, label: '16 px' },
] as const;

/** Safety limits shared with the save service. */
export const STITCH_MAX_PIXELS = 32_000_000;
export const STITCH_MAX_LONG_EDGE = 16_000;

/** Plans the stitched canvas size, scaling every image to one column width. */
export function planStitch(sizes: ImageSize[], targetWidth: number, gap: number): StitchPlan {
  if (!Array.isArray(sizes) || sizes.length === 0) throw new Error('请先选择图片');
  if (sizes.length > 50) throw new Error('一次最多拼接 50 张图片');
  if (!Number.isFinite(gap) || gap < 0 || gap > 200) throw new Error('图片间距无效');
  for (const size of sizes) {
    if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width < 1 || size.height < 1) {
      throw new Error('图片尺寸无效');
    }
  }
  const maxWidth = Math.max(...sizes.map((size) => size.width));
  const width = Math.round(targetWidth > 0 ? targetWidth : maxWidth);
  if (width < 1) throw new Error('目标宽度无效');
  if (width > STITCH_MAX_LONG_EDGE) throw new Error(`目标宽度不能超过 ${STITCH_MAX_LONG_EDGE} 像素`);
  const scaled = sizes.map((size) => ({
    width,
    height: Math.max(1, Math.round((size.height * width) / size.width)),
  }));
  const totalHeight = scaled.reduce((sum, size) => sum + size.height, 0) + Math.round(gap) * (scaled.length - 1);
  if (totalHeight > STITCH_MAX_LONG_EDGE) {
    throw new Error(`拼接后的长度 ${totalHeight} 像素超过 ${STITCH_MAX_LONG_EDGE} 上限，请减少图片或降低目标宽度`);
  }
  if (width * totalHeight > STITCH_MAX_PIXELS) {
    throw new Error(`拼接后的图片约 ${(width * totalHeight / 1_000_000).toFixed(1)} 百万像素，超过 ${STITCH_MAX_PIXELS / 1_000_000} 百万上限`);
  }
  return { width, totalHeight, scaled, gap: Math.round(gap) };
}

export type StitchFormat = 'png' | 'jpeg';

/** Creates the white canvas that receives every stitched slice. */
export function createStitchCanvas(plan: StitchPlan): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.totalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建长图画布');
  // Long screenshots are usually opaque; a white base avoids dark JPEG gaps.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Draws one planned slice at its vertical offset. */
export function drawStitchSlice(canvas: HTMLCanvasElement, image: CanvasImageSource, plan: StitchPlan, index: number): void {
  if (index < 0 || index >= plan.scaled.length) throw new Error('拼接序号无效');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法读取长图画布');
  const size = plan.scaled[index];
  let y = 0;
  for (let cursor = 0; cursor < index; cursor++) {
    y += plan.scaled[cursor].height + plan.gap;
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, y, size.width, size.height);
}

/** Encodes the stitched canvas as a base64 payload. */
export function encodeStitch(canvas: HTMLCanvasElement, format: StitchFormat): string {
  const mime = format === 'jpeg' ? 'data:image/jpeg;base64,' : 'data:image/png;base64,';
  const data = canvas.toDataURL(format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.92);
  if (!data.startsWith(mime)) throw new Error('长图编码失败');
  return data.slice(mime.length);
}
