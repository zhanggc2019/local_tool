import { cutOutPersonCanvas } from '../shared/person-segmenter';

export type CutoutBackground = 'transparent' | 'white' | 'blue' | 'red' | 'green';
export type CutoutFormat = 'png' | 'jpeg';

/** Background presets offered by the cutout tool. */
export const CUTOUT_BACKGROUNDS: Record<CutoutBackground, { label: string; fill: string | null }> = {
  transparent: { label: '透明', fill: null },
  white: { label: '白底', fill: '#ffffff' },
  blue: { label: '蓝底', fill: '#438EDB' },
  red: { label: '红底', fill: '#C9373B' },
  green: { label: '绿底', fill: '#3D9E52' },
};

/** Checks one background identifier from the interface. */
export function isCutoutBackground(value: string): value is CutoutBackground {
  return Object.prototype.hasOwnProperty.call(CUTOUT_BACKGROUNDS, value);
}

/** Resolves the requested output format; transparency requires PNG. */
export function effectiveFormat(background: CutoutBackground, requested: CutoutFormat): CutoutFormat {
  if (background === 'transparent') return 'png';
  return requested === 'jpeg' ? 'jpeg' : 'png';
}

/** Segments one local image and returns a transparent cutout canvas. */
export function cutOutPortrait(file: File): Promise<HTMLCanvasElement> {
  return cutOutPersonCanvas(file, {
    minDimension: 100,
    maxDimension: 2000,
    minPersonRatio: 0.005,
    tooSmallMessage: '图片分辨率太低，请更换更清晰的图片',
    notFoundMessage: '未识别到清晰的人像，请更换含人物的图片',
  });
}

/** Draws one cutout onto the selected background at full canvas resolution. */
export function compositeBackground(cutout: HTMLCanvasElement, background: CutoutBackground): HTMLCanvasElement {
  const fill = CUTOUT_BACKGROUNDS[background].fill;
  const canvas = document.createElement('canvas');
  canvas.width = cutout.width;
  canvas.height = cutout.height;
  const context = canvas.getContext('2d', { alpha: fill === null });
  if (!context) throw new Error('无法创建抠图画布');
  if (fill !== null) {
    context.fillStyle = fill;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(cutout, 0, 0);
  return canvas;
}

/** Encodes the finished canvas as a base64 payload for the Go save service. */
export function encodeCutout(canvas: HTMLCanvasElement, format: CutoutFormat): string {
  const mime = format === 'jpeg' ? 'data:image/jpeg;base64,' : 'data:image/png;base64,';
  const data = canvas.toDataURL(format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.92);
  if (!data.startsWith(mime)) throw new Error('抠图编码失败');
  return data.slice(mime.length);
}
