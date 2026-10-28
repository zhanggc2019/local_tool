export type PhotoSize = 'one' | 'two';
export type PhotoColor = 'blue' | 'red';

export interface PhotoSpec { label: string; width: number; height: number; mmWidth: number; mmHeight: number }
export interface Placement { x: number; y: number; width: number; height: number; panX: number; panY: number }

export const PHOTO_SPECS: Record<PhotoSize, PhotoSpec> = {
  one: { label: '1 寸', width: 295, height: 413, mmWidth: 25, mmHeight: 35 },
  two: { label: '2 寸', width: 413, height: 579, mmWidth: 35, mmHeight: 49 },
};

export const PHOTO_COLORS: Record<PhotoColor, string> = { blue: '#438EDB', red: '#C9373B' };

let segmenterPromise: Promise<import('@mediapipe/tasks-vision').ImageSegmenter> | null = null;

/** Loads the bundled person-segmentation model and WASM runtime only on first use. */
async function getSegmenter(): Promise<import('@mediapipe/tasks-vision').ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
      const wasm = await FilesetResolver.forVisionTasks(new URL('/mediapipe/wasm/', window.location.href).href);
      return ImageSegmenter.createFromOptions(wasm, {
        baseOptions: { modelAssetPath: new URL('/mediapipe/models/selfie_segmenter.tflite', window.location.href).href, delegate: 'CPU' },
        runningMode: 'IMAGE',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
    })().catch((error: unknown) => {
      segmenterPromise = null;
      throw error;
    });
  }
  return segmenterPromise;
}

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
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1 || file.size > 20 * 1024 * 1024) {
    throw new Error('请选择 20 MB 以内的 JPG、PNG 或 WebP 照片');
  }
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width < 200 || bitmap.height < 200) throw new Error('原图分辨率太低，请选择更清晰的照片');
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    const sourceContext = source.getContext('2d');
    if (!sourceContext) throw new Error('无法读取照片画布');
    sourceContext.imageSmoothingQuality = 'high';
    sourceContext.drawImage(bitmap, 0, 0, width, height);

    const segmenter = await getSegmenter();
    const result = segmenter.segment(source);
    try {
      const personMask = result.confidenceMasks?.[0];
      if (!personMask) throw new Error('人像识别未返回有效结果');
      const values = personMask.getAsFloat32Array();
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = personMask.width;
      maskCanvas.height = personMask.height;
      const maskContext = maskCanvas.getContext('2d');
      if (!maskContext) throw new Error('无法创建人像蒙版');
      const pixels = maskContext.createImageData(maskCanvas.width, maskCanvas.height);
      let personPixels = 0;
      for (let index = 0; index < values.length; index++) {
        const confidence = values[index];
        if (confidence > 0.5) personPixels++;
        const alpha = Math.max(0, Math.min(1, (confidence - 0.12) / 0.72));
        const offset = index * 4;
        pixels.data[offset] = 255;
        pixels.data[offset + 1] = 255;
        pixels.data[offset + 2] = 255;
        pixels.data[offset + 3] = Math.round(alpha * alpha * (3 - 2 * alpha) * 255);
      }
      if (personPixels < values.length * 0.01) throw new Error('未识别到清晰的人像，请更换正面照片');
      maskContext.putImageData(pixels, 0, 0);
      const cutout = document.createElement('canvas');
      cutout.width = width;
      cutout.height = height;
      const cutoutContext = cutout.getContext('2d');
      if (!cutoutContext) throw new Error('无法创建证件照画布');
      cutoutContext.drawImage(source, 0, 0);
      cutoutContext.globalCompositeOperation = 'destination-in';
      cutoutContext.imageSmoothingEnabled = true;
      cutoutContext.imageSmoothingQuality = 'high';
      cutoutContext.drawImage(maskCanvas, 0, 0, width, height);
      return cutout;
    } finally {
      result.close();
    }
  } finally {
    bitmap.close();
  }
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
