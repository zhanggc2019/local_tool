export type StampAnchor = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br' | 'tile';
export type StampFormat = 'png' | 'jpeg';

/** Anchor choices shown as a 3×3 grid plus a tile option. */
export const STAMP_ANCHORS: { value: StampAnchor; label: string }[] = [
  { value: 'tl', label: '左上' }, { value: 'tc', label: '上' }, { value: 'tr', label: '右上' },
  { value: 'ml', label: '左' }, { value: 'mc', label: '居中' }, { value: 'mr', label: '右' },
  { value: 'bl', label: '左下' }, { value: 'bc', label: '下' }, { value: 'br', label: '右下' },
];

export const STAMP_COLORS = [
  { value: '#ffffff', label: '白' },
  { value: '#000000', label: '黑' },
  { value: '#c0392b', label: '红' },
  { value: '#245fae', label: '蓝' },
] as const;

/** Checks one anchor identifier from the interface. */
export function isStampAnchor(value: string): value is StampAnchor {
  return value === 'tile' || STAMP_ANCHORS.some((anchor) => anchor.value === value);
}

/** Clamps a numeric value into an inclusive range. */
export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export interface Point { x: number; y: number }

/** Computes the top-left corner for one anchored watermark block. */
export function anchorPosition(
  canvasWidth: number,
  canvasHeight: number,
  contentWidth: number,
  contentHeight: number,
  anchor: StampAnchor,
  margin: number,
): Point {
  const left = margin;
  const centerX = (canvasWidth - contentWidth) / 2;
  const right = canvasWidth - contentWidth - margin;
  const top = margin;
  const centerY = (canvasHeight - contentHeight) / 2;
  const bottom = canvasHeight - contentHeight - margin;
  switch (anchor) {
    case 'tl': return { x: left, y: top };
    case 'tc': return { x: centerX, y: top };
    case 'tr': return { x: right, y: top };
    case 'ml': return { x: left, y: centerY };
    case 'mc': return { x: centerX, y: centerY };
    case 'mr': return { x: right, y: centerY };
    case 'bl': return { x: left, y: bottom };
    case 'bc': return { x: centerX, y: bottom };
    case 'br': return { x: right, y: bottom };
    default: return { x: left, y: top };
  }
}

/** Computes repeated watermark positions that cover the whole canvas. */
export function tilePositions(
  canvasWidth: number,
  canvasHeight: number,
  contentWidth: number,
  contentHeight: number,
  gap: number,
): Point[] {
  if (canvasWidth < 1 || canvasHeight < 1) return [];
  const stepX = Math.max(1, contentWidth + gap * 2);
  const stepY = Math.max(1, contentHeight + gap * 2);
  const positions: Point[] = [];
  // Two extra rows/columns keep partial tiles at the edges covered.
  for (let y = -contentHeight / 2; y < canvasHeight + contentHeight; y += stepY) {
    for (let x = -contentWidth / 2; x < canvasWidth + contentWidth; x += stepX) {
      positions.push({ x, y });
    }
  }
  return positions;
}

export interface StampOptions {
  text: string;
  size: number;
  opacity: number;
  color: string;
  anchor: StampAnchor;
  format: StampFormat;
}

/** Draws the watermark text onto a canvas at natural image resolution. */
export function renderStamp(source: ImageBitmap | HTMLCanvasElement, options: StampOptions): HTMLCanvasElement {
  const width = source.width;
  const height = source.height;
  if (width < 1 || height < 1) throw new Error('图片尺寸无效');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建水印画布');
  if (options.format === 'jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(source, 0, 0);
  const text = options.text.trim();
  if (!text) return canvas;
  const size = Math.round(clampNumber(options.size, 8, 400));
  const margin = Math.round(Math.max(12, size * 0.6));
  context.font = `600 ${size}px "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif`;
  context.textBaseline = 'top';
  context.globalAlpha = clampNumber(options.opacity, 5, 100) / 100;
  context.fillStyle = options.color;
  context.shadowColor = 'rgba(0, 0, 0, 0.45)';
  context.shadowBlur = Math.max(1, size / 12);
  const metrics = context.measureText(text);
  const contentWidth = Math.ceil(metrics.width);
  const contentHeight = Math.ceil(size * 1.25);
  if (options.anchor === 'tile') {
    for (const point of tilePositions(width, height, contentWidth, contentHeight, size)) {
      context.fillText(text, point.x, point.y);
    }
  } else {
    const point = anchorPosition(width, height, contentWidth, contentHeight, options.anchor, margin);
    context.fillText(text, point.x, point.y);
  }
  return canvas;
}

/** Encodes a finished stamp canvas as a base64 payload. */
export function encodeStamp(canvas: HTMLCanvasElement, format: StampFormat): string {
  const mime = format === 'jpeg' ? 'data:image/jpeg;base64,' : 'data:image/png;base64,';
  const data = canvas.toDataURL(format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.92);
  if (!data.startsWith(mime)) throw new Error('水印图片编码失败');
  return data.slice(mime.length);
}
