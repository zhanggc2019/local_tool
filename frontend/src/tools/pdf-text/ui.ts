import { TextOutputService, type LocalSource } from '../../../bindings/example.com/pdf-desktop/internal/app';
import { chooseSources, readSource } from '../source-file';
import { extractPDFText, previewSnippet } from './extractor';

let source: LocalSource | null = null;
let extracted = '';
let busy = false;

/** Finds one required PDF text element. */
function textEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少 PDF 提取文本界面元素：${id}`);
  return node as T;
}

/** Displays one native or validation error using text content only. */
function textError(error: unknown): void {
  const box = textEl<HTMLDivElement>('textError');
  box.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : '提取文本失败';
  box.hidden = false;
}

/** Clears any previously extracted text and preview. */
function resetExtraction(): void {
  extracted = '';
  const preview = textEl<HTMLTextAreaElement>('textPreview');
  preview.value = '';
  preview.hidden = true;
  textEl<HTMLElement>('textStats').hidden = true;
  textEl<HTMLDivElement>('textProgressHint').textContent = '提取后先预览，再决定是否保存。';
}

/** Shows the selected PDF and refreshes the action state. */
function renderTextState(): void {
  const card = textEl<HTMLDivElement>('textFile');
  card.replaceChildren();
  if (!source) {
    card.hidden = true;
  } else {
    const name = document.createElement('strong');
    name.textContent = source.name;
    name.title = source.path;
    const detail = document.createElement('small');
    detail.textContent = '已选择 · 可提取文本层';
    card.append(name, detail);
    card.hidden = false;
  }
  textEl<HTMLDivElement>('textEmpty').hidden = source !== null;
  textEl<HTMLButtonElement>('textRun').disabled = busy || !source;
  textEl<HTMLButtonElement>('textSave').disabled = busy || !source || !extracted;
}

/** Opens the native selector for one PDF. */
async function chooseTextPDF(): Promise<void> {
  if (busy) return;
  textEl<HTMLDivElement>('textError').hidden = true;
  try {
    const selected = await chooseSources('pdf-text', false);
    if (!selected?.length) return;
    source = selected[0];
    textEl<HTMLDivElement>('textResult').hidden = true;
    resetExtraction();
    renderTextState();
  } catch (error) { textError(error); }
}

/** Extracts the text layer and shows a preview. */
async function extractText(): Promise<void> {
  if (busy || !source) return;
  busy = true;
  renderTextState();
  textEl<HTMLDivElement>('textError').hidden = true;
  textEl<HTMLDivElement>('textResult').hidden = true;
  const status = textEl<HTMLDivElement>('textStatus');
  status.textContent = '正在加载 PDF…';
  status.hidden = false;
  try {
    const file = await readSource('pdf-text', 0, source);
    const result = await extractPDFText(file, (completed, total) => {
      status.textContent = `正在解析 ${completed} / ${total} 页…`;
    });
    extracted = result.text;
    textEl<HTMLDivElement>('textStats').hidden = false;
    textEl<HTMLElement>('textStatsPages').textContent = `${result.pages} 页${result.emptyPages ? ` · ${result.emptyPages} 页无文本` : ''}`;
    textEl<HTMLElement>('textStatsChars').textContent = `${result.text.length} 字符`;
    const preview = textEl<HTMLTextAreaElement>('textPreview');
    preview.value = previewSnippet(result.text);
    preview.hidden = false;
    textEl<HTMLDivElement>('textProgressHint').textContent = '确认预览内容后点击“保存 TXT”。';
  } catch (error) {
    textError(error);
  } finally {
    busy = false;
    status.hidden = true;
    renderTextState();
  }
}

/** Saves the extracted text beside the PDF. */
async function saveText(): Promise<void> {
  if (busy || !source || !extracted) return;
  busy = true;
  renderTextState();
  textEl<HTMLDivElement>('textError').hidden = true;
  try {
    const path = await TextOutputService.SaveTextBesideSource(source.path, 'pdf-text', extracted);
    textEl<HTMLElement>('textResultTitle').textContent = '文本已保存';
    textEl<HTMLElement>('textResultPath').textContent = path;
    textEl<HTMLDivElement>('textResult').hidden = false;
  } catch (error) {
    textError(error);
  } finally {
    busy = false;
    renderTextState();
  }
}

/** Wires selection, extraction, saving, and folder opening. */
export function setupPDFTextTool(): void {
  textEl<HTMLButtonElement>('textPick').addEventListener('click', () => void chooseTextPDF());
  textEl<HTMLButtonElement>('textRun').addEventListener('click', () => void extractText());
  textEl<HTMLButtonElement>('textSave').addEventListener('click', () => void saveText());
  textEl<HTMLButtonElement>('textOpenFolder').addEventListener('click', async () => {
    try { await TextOutputService.OpenTextOutputFolder(); }
    catch (error) { textError(error); }
  });
  renderTextState();
}
