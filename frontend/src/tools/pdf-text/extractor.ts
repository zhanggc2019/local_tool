import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { assemblePageText, joinPageTexts, type TextItemLike } from './text';

GlobalWorkerOptions.workerSrc = workerUrl;

export type { TextItemLike } from './text';
export { assemblePageText, joinPageTexts, previewSnippet } from './text';

export interface ExtractedText { text: string; pages: number; emptyPages: number }
export type TextProgress = (completed: number, total: number) => void;

/** Extracts the text layer from one local PDF with the bundled PDF.js. */
export async function extractPDFText(file: File, progress: TextProgress): Promise<ExtractedText> {
  if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('请选择 PDF 文件');
  if (file.size === 0 || file.size > 100 * 1024 * 1024) throw new Error('PDF 大小需在 100 MB 以内');
  const data = new Uint8Array(await file.arrayBuffer());
  let document;
  try {
    document = await getDocument({
      data,
      isEvalSupported: false,
      useSystemFonts: true,
      cMapUrl: '/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/standard_fonts/',
    }).promise;
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'PasswordException') throw new Error('该 PDF 已加密，请先使用“PDF 加密 / 解密”工具解密');
    throw error;
  }
  try {
    if (document.numPages < 1 || document.numPages > 500) throw new Error('仅支持 1 至 500 页的 PDF');
    const pages: string[] = [];
    let emptyPages = 0;
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const text = assemblePageText(content.items.filter((item): item is TextItemLike => 'str' in item));
      if (!text) emptyPages++;
      pages.push(text);
      page.cleanup();
      progress(number, document.numPages);
    }
    const text = joinPageTexts(pages);
    if (!text) throw new Error('该 PDF 没有可提取的文本层，可能是扫描件');
    return { text, pages: document.numPages, emptyPages };
  } finally {
    await document.destroy();
  }
}
