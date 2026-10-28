import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { planLayout, type ExportMode, type ImageFormat, type PageSize, type ImageLayout } from './layout';

GlobalWorkerOptions.workerSrc = workerUrl;

export interface LoadedPDF { document: PDFDocumentProxy; sizes: PageSize[]; name: string; bytes: number }
export interface ConversionOptions { mode: ExportMode; format: ImageFormat; width: number }
export type ProgressCallback = (completed: number, total: number) => void;
export type SaveCallback = (number: number, base64: string) => Promise<void>;

/** Loads a local PDF into the bundled PDF.js renderer and reads its page sizes. */
export async function loadPDF(file: File): Promise<LoadedPDF> {
  if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('请选择 PDF 文件');
  if (file.size === 0 || file.size > 100 * 1024 * 1024) throw new Error('PDF 大小需在 100 MB 以内');
  const data = new Uint8Array(await file.arrayBuffer());
  const document = await getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
    cMapUrl: '/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/standard_fonts/',
  }).promise;
  if (document.numPages < 1 || document.numPages > 500) {
    await document.destroy();
    throw new Error('仅支持 1 至 500 页的 PDF');
  }
  const sizes: PageSize[] = [];
  for (let number = 1; number <= document.numPages; number++) {
    const page = await document.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    sizes.push({ width: viewport.width, height: viewport.height });
    page.cleanup();
  }
  return { document, sizes, name: file.name, bytes: file.size };
}

/** Renders the first page into the compact source preview. */
export async function renderPreview(pdf: LoadedPDF, canvas: HTMLCanvasElement): Promise<void> {
  const page = await pdf.document.getPage(1);
  const scale = Math.min(250 / pdf.sizes[0].width, 340 / pdf.sizes[0].height);
  const viewport = page.getViewport({ scale });
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('无法创建预览画布');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  page.cleanup();
}

/** Returns output dimensions for the current PDF and settings. */
export function estimateLayout(pdf: LoadedPDF, options: ConversionOptions): ImageLayout {
  return planLayout(pdf.sizes, options.width, options.mode);
}

/** Converts pages sequentially so memory usage stays bounded during export. */
export async function convertPDF(pdf: LoadedPDF, options: ConversionOptions, save: SaveCallback, progress: ProgressCallback): Promise<void> {
  const layout = estimateLayout(pdf, options);
  if (options.mode === 'single') {
    const canvas = createCanvas(layout.width, layout.height);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('无法创建图片画布');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    let top = 0;
    for (let index = 0; index < pdf.sizes.length; index++) {
      const pageCanvas = await renderPage(pdf.document, index + 1, layout.width, layout.pageHeights[index]);
      context.drawImage(pageCanvas, 0, top);
      top += layout.pageHeights[index] + layout.gap;
      progress(index + 1, pdf.sizes.length + 1);
      pageCanvas.width = 0;
      pageCanvas.height = 0;
    }
    await save(1, encodeCanvas(canvas, options.format));
    canvas.width = 0;
    canvas.height = 0;
    progress(pdf.sizes.length + 1, pdf.sizes.length + 1);
    return;
  }

  for (let index = 0; index < pdf.sizes.length; index++) {
    const canvas = await renderPage(pdf.document, index + 1, layout.width, layout.pageHeights[index]);
    await save(index + 1, encodeCanvas(canvas, options.format));
    canvas.width = 0;
    canvas.height = 0;
    progress(index + 1, pdf.sizes.length);
  }
}

/** Allocates a canvas only after layout constraints have been checked. */
function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Renders one PDF page with a white background at the planned dimensions. */
async function renderPage(pdf: PDFDocumentProxy, number: number, width: number, height: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(number);
  const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('无法创建图片画布');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  page.cleanup();
  return canvas;
}

/** Encodes one bounded canvas as a base64 payload for the Go export service. */
function encodeCanvas(canvas: HTMLCanvasElement, format: ImageFormat): string {
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const dataUrl = canvas.toDataURL(mime, format === 'jpeg' ? 0.82 : undefined);
  if (!dataUrl.startsWith(`data:${mime};base64,`)) throw new Error('图片编码失败');
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}
