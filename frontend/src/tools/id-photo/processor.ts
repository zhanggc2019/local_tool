import { cutOutPersonCanvas } from '../shared/person-segmenter';

export type PhotoSize = 'one' | 'two';
export type PhotoColor = 'blue' | 'red' | 'white';

export interface PhotoSpec { label: string; width: number; height: number; mmWidth: number; mmHeight: number }
export interface Placement { x: number; y: number; width: number; height: number; panX: number; panY: number }

export const PHOTO_SPECS: Record<PhotoSize, PhotoSpec> = {
  one: { label: '1 寸', width: 295, height: 413, mmWidth: 25, mmHeight: 35 },
  two: { label: '2 寸', width: 413, height: 579, mmWidth: 35, mmHeight: 49 },
};

export const PHOTO_COLORS: Record<PhotoColor, string> = { blue: '#438EDB', red: '#C9373B', white: '#FFFFFF' };

/** Computes a cover crop and clamps dragging so the output has no empty edges. */
export function calculatePlacement(sourceWidth: number, sourceHeight: number, outputWidth: number, outputHeight: number, zoom: number, panX: number, panY: number): Placement {
  if (![sourceWidth, sourceHeight, outputWidth, outputHeight, zoom, panX, panY].every(Number.isFinite) || sourceWidth <= 0 || sourceHeight <= 0 || outputWidth <= 0 || outputHeight <= 0 || zoom < 1) {
    throw new Error('照片裁切参数无效');
  }
  const scale = Math.max(outputWidth / sourceWidth, outputHeight / sourceHeight) * zoom;
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const limitX = Math.max(0, (width - outputWidth) / (2 * outputWidth));
  const limitY = Math.max(0, (height - outputHeight) / (2 * outputHeight));
  const clampedX = Math.min(limitX, Math.max(-limitX, panX));
  const clampedY = Math.min(limitY, Math.max(-limitY, panY));
  return {
    x: (outputWidth - width) / 2 + clampedX * outputWidth,
    y: (outputHeight - height) / 2 + clampedY * outputHeight,
    width,
    height,
    panX: clampedX,
    panY: clampedY,
  };
}

/** Segments one local image and returns a transparent canvas containing the person. */
export async function cutOutPerson(file: File): Promise<HTMLCanvasElement> {
  return cutOutPersonCanvas(file, {
    minDimension: 200,
    maxDimension: 1200,
    minPersonRatio: 0.01,
    tooSmallMessage: '原图分辨率太低，请选择更清晰的照片',
    notFoundMessage: '未识别到清晰的人像，请更换正面照片',
  });
}

/** Draws the selected solid background and cropped person at exact output pixels. */
export function renderPhoto(person: HTMLCanvasElement, output: HTMLCanvasElement, size: PhotoSize, color: PhotoColor, zoom: number, panX: number, panY: number): Placement {
  const spec = PHOTO_SPECS[size];
  output.width = spec.width;
  output.height = spec.height;
  const context = output.getContext('2d', { alpha: false });
  if (!context) throw new Error('无法创建证件照预览');
  context.fillStyle = PHOTO_COLORS[color];
  context.fillRect(0, 0, spec.width, spec.height);
  const placement = calculatePlacement(person.width, person.height, spec.width, spec.height, zoom, panX, panY);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(person, placement.x, placement.y, placement.width, placement.height);
  return placement;
}

/** Encodes the finished canvas as a JPEG payload for the Go save service. */
export function encodePhoto(canvas: HTMLCanvasElement): string {
  const data = canvas.toDataURL('image/jpeg', 0.92);
  if (!data.startsWith('data:image/jpeg;base64,')) throw new Error('证件照编码失败');
  return data.slice('data:image/jpeg;base64,'.length);
}

/** Encodes the finished canvas as a PNG payload for the Go save service. */
export function encodePhotoPNG(canvas: HTMLCanvasElement): string {
  const data = canvas.toDataURL('image/png');
  if (!data.startsWith('data:image/png;base64,')) throw new Error('证件照编码失败');
  return data.slice('data:image/png;base64,'.length);
}
