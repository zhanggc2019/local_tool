import { PDFPageService, type PDFSource } from '../../../bindings/example.com/pdf-desktop/internal/app';

let source: PDFSource | null = null;
let busy = false;

/** Finds one required PDF page management element. */
function pageEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少 PDF 页面管理界面元素：${id}`);
  return node as T;
}

/** Displays one native or validation error using text content only. */
function pageError(error: unknown): void {
  const box = pageEl<HTMLDivElement>('pageError');
  box.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : '页面操作失败';
  box.hidden = false;
}

/** Shows the selected PDF and enables the action buttons. */
function renderPageFile(): void {
  const card = pageEl<HTMLDivElement>('pageFile');
  card.replaceChildren();
  if (!source) {
    card.hidden = true;
  } else {
    const name = document.createElement('strong');
    name.textContent = source.name;
    const detail = document.createElement('small');
    detail.textContent = `共 ${source.pages} 页 · 页码范围 1–${source.pages}`;
    card.append(name, detail);
    card.hidden = false;
  }
  pageEl<HTMLDivElement>('pageEmpty').hidden = source !== null;
  for (const id of ['pageRotate', 'pageDelete', 'pageExtract']) {
    pageEl<HTMLButtonElement>(id).disabled = busy || source === null;
  }
}

/** Opens the native selector for one PDF. */
async function choosePagePDF(): Promise<void> {
  if (busy) return;
  pageEl<HTMLDivElement>('pageError').hidden = true;
  try {
    const selected = await PDFPageService.ChoosePDF();
    if (!selected) return;
    source = selected;
    pageEl<HTMLDivElement>('pageResult').hidden = true;
    pageEl<HTMLInputElement>('pageSelection').value = '';
    pageEl<HTMLDivElement>('pageHint').textContent = '旋转留空表示全部页面；删除与提取需要明确页码。';
    renderPageFile();
  } catch (error) { pageError(error); }
}

/** Runs one page operation with a shared busy/status lifecycle. */
async function runPageOperation(statusText: string, action: () => Promise<{ location: string; count: number }>, summary: (count: number) => string): Promise<void> {
  if (busy || !source) return;
  busy = true;
  renderPageFile();
  pageEl<HTMLDivElement>('pageError').hidden = true;
  pageEl<HTMLDivElement>('pageResult').hidden = true;
  const status = pageEl<HTMLDivElement>('pageStatus');
  status.textContent = statusText;
  status.hidden = false;
  try {
    const result = await action();
    pageEl<HTMLElement>('pageResultTitle').textContent = summary(result.count);
    pageEl<HTMLElement>('pageResultPath').textContent = result.location;
    pageEl<HTMLDivElement>('pageResult').hidden = false;
  } catch (error) {
    pageError(error);
  } finally {
    busy = false;
    status.hidden = true;
    renderPageFile();
  }
}

/** Reads the current angle choice. */
function currentAngle(): number {
  return Number(document.querySelector<HTMLInputElement>('input[name="pageAngle"]:checked')?.value ?? 90);
}

/** Wires selection, quick presets, and the three operations. */
export function setupPDFPageTool(): void {
  pageEl<HTMLButtonElement>('pagePick').addEventListener('click', () => void choosePagePDF());
  const selection = pageEl<HTMLInputElement>('pageSelection');
  selection.addEventListener('input', () => {
    pageEl<HTMLDivElement>('pageHint').textContent = selection.value.trim()
      ? `将处理：${selection.value.trim()}`
      : '旋转留空表示全部页面；删除与提取需要明确页码。';
  });
  document.querySelectorAll<HTMLButtonElement>('.page-quick-row button').forEach((button) => button.addEventListener('click', () => {
    selection.value = button.dataset.preset ?? '';
    selection.dispatchEvent(new Event('input'));
  }));
  document.querySelectorAll<HTMLInputElement>('input[name="pageAngle"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('#pageAngles .choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
  }));
  pageEl<HTMLButtonElement>('pageRotate').addEventListener('click', () => void runPageOperation(
    '正在旋转页面…',
    () => PDFPageService.RotatePages(currentAngle(), selection.value.trim()),
    (count) => `已旋转 ${count} 页`,
  ));
  pageEl<HTMLButtonElement>('pageDelete').addEventListener('click', () => void runPageOperation(
    '正在删除页面…',
    () => PDFPageService.DeletePages(selection.value.trim()),
    (count) => `删除完成，剩余 ${count} 页`,
  ));
  pageEl<HTMLButtonElement>('pageExtract').addEventListener('click', () => void runPageOperation(
    '正在提取页面…',
    () => PDFPageService.ExtractPages(selection.value.trim()),
    (count) => `已提取 ${count} 个单页 PDF`,
  ));
  pageEl<HTMLButtonElement>('pageOpenFolder').addEventListener('click', async () => {
    try { await PDFPageService.OpenPDFPageOutputFolder(); }
    catch (error) { pageError(error); }
  });
  renderPageFile();
}
