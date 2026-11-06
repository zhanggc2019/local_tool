export interface SegmentationLimits {
  /** Rejects inputs whose shorter side is below this pixel count. */
  minDimension: number;
  /** Downscales the inference canvas so its longest side fits this bound. */
  maxDimension: number;
  /** Required share of person pixels for a usable result. */
  minPersonRatio: number;
  /** Message shown when the photo is too small. */
  tooSmallMessage: string;
  /** Message shown when no person is detected. */
  notFoundMessage: string;
}

let segmenterPromise: Promise<import('@mediapipe/tasks-vision').ImageSegmenter> | null = null;

/** Loads the bundled person-segmentation model and WASM runtime only on first use. */
export function getPersonSegmenter(): Promise<import('@mediapipe/tasks-vision').ImageSegmenter> {
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

/** Smoothstep curve mapping segmentation confidence to mask alpha. */
export function maskAlpha(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  const clamped = Math.max(0, Math.min(1, (confidence - 0.12) / 0.72));
  return Math.round(clamped * clamped * (3 - 2 * clamped) * 255);
}

/** Decodes a local image, segments the person, and returns a transparent canvas. */
export async function cutOutPersonCanvas(file: File, limits: SegmentationLimits): Promise<HTMLCanvasElement> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1 || file.size > 20 * 1024 * 1024) {
    throw new Error('请选择 20 MB 以内的 JPG、PNG 或 WebP 图片');
  }
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width < limits.minDimension || bitmap.height < limits.minDimension) throw new Error(limits.tooSmallMessage);
    const scale = Math.min(1, limits.maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    const sourceContext = source.getContext('2d');
    if (!sourceContext) throw new Error('无法读取图片画布');
    sourceContext.imageSmoothingQuality = 'high';
    sourceContext.drawImage(bitmap, 0, 0, width, height);

    const segmenter = await getPersonSegmenter();
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
        const offset = index * 4;
        pixels.data[offset] = 255;
        pixels.data[offset + 1] = 255;
        pixels.data[offset + 2] = 255;
        pixels.data[offset + 3] = maskAlpha(confidence);
      }
      if (personPixels < values.length * limits.minPersonRatio) throw new Error(limits.notFoundMessage);
      maskContext.putImageData(pixels, 0, 0);
      const cutout = document.createElement('canvas');
      cutout.width = width;
      cutout.height = height;
      const cutoutContext = cutout.getContext('2d');
      if (!cutoutContext) throw new Error('无法创建抠图画布');
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
