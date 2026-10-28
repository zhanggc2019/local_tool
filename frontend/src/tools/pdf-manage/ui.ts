import { PDFManageService, type PDFSource } from '../../../bindings/example.com/pdf-desktop';

type Mode = 'merge' | 'split' | 'compress';
let mode: Mode = 'merge';
let sources: PDFSource[] = [];
let order: number[] = [];
let busy = false;

/** Returns a required PDF management element. */
function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少界面元素：${id}`);
  return node as T;
}

/** Formats a byte count for source and result labels. */
function size(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** Converts a Wails rejection into a user-facing message. */
function message(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : '操作失败，请重试';
}

/** Shows the selected documents and their current merge order. */
function renderFiles(): void {
  const list = el<HTMLOListElement>('manageFiles');
  list.replaceChildren();
  order.forEach((index, position) => {
    const item = document.createElement('li');
    const source = sources[index];
    const text = document.createElement('div');
    text.className = 'manage-file-copy';
    const name = document.createElement('strong');
    name.textContent = source.name;
    const meta = document.createElement('small');
    meta.textContent = `${source.pages} 页 · ${size(source.bytes)}`;
    text.append(name, meta);
    item.append(text);
    if (mode === 'merge') {
      const controls = document.createElement('div');
      controls.className = 'manage-order';
      for (const [label, delta] of [['↑', -1], ['↓', 1]] as const) {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = label; button.title = delta < 0 ? '上移' : '下移';
        button.disabled = busy || position + delta < 0 || position + delta >= order.length;
        button.addEventListener('click', () => {
          [order[position], order[position + delta]] = [order[position + delta], order[position]];
          renderFiles();
        });
        controls.append(button);
      }
      item.append(controls);
    }
    list.append(item);
  });
  list.hidden = !sources.length;
  el<HTMLDivElement>('manageEmpty').hidden = !!sources.length;
  const valid = mode === 'merge' ? sources.length >= 2 : sources.length === 1 && (mode !== 'split' || sources[0].pages > 1);
  el<HTMLButtonElement>('manageRun').disabled = busy || !valid;
}

/** Switches operation, clearing a selection whose cardinality no longer fits. */
function selectMode(next: Mode): void {
  if (busy) return;
  mode = next;
  sources = []; order = [];
  document.querySelectorAll<HTMLButtonElement>('.manage-tab').forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  const labels = { merge: '合并并保存', split: '拆分并保存', compress: '压缩并保存' };
  const explanations = { merge: '按左侧顺序将所有 PDF 合并为一个文件。', split: '按指定页数拆分为多个 PDF，保存到所选文件夹中的新子文件夹。', compress: '优化 PDF 内部结构并保存为新文件。' };
  el<HTMLButtonElement>('manageRun').textContent = labels[mode];
  el<HTMLDivElement>('manageExplain').textContent = explanations[mode];
  el<HTMLElement>('manageSourceHint').textContent = mode === 'merge' ? '选择至少两个 PDF' : '选择一个 PDF';
  el<HTMLButtonElement>('managePick').textContent = mode === 'merge' ? '选择多个 PDF' : '选择 PDF 文件';
  el<HTMLElement>('manageSourceTip').textContent = mode === 'merge' ? '合并时可调整文件顺序。' : '源文件不会被修改。';
  el<HTMLDivElement>('manageSplitSettings').hidden = mode !== 'split';
  el<HTMLDivElement>('manageCompressHint').hidden = mode !== 'compress';
  el<HTMLDivElement>('manageResult').hidden = true;
  el<HTMLDivElement>('manageError').hidden = true;
  renderFiles();
}

/** Opens the native picker for this operation. */
async function pickFiles(): Promise<void> {
  if (busy) return;
  el<HTMLDivElement>('manageError').hidden = true;
  try {
    const picked = await PDFManageService.ChoosePDFs(mode === 'merge');
    if (!picked?.length) return;
    sources = picked;
    order = sources.map((_, index) => index);
    el<HTMLDivElement>('manageResult').hidden = true;
    renderFiles();
  } catch (error) {
    const box = el<HTMLDivElement>('manageError');
    box.textContent = `读取 PDF 失败：${message(error)}`;
    box.hidden = false;
  }
}

/** Runs the selected PDF operation and reports its output. */
async function run(): Promise<void> {
  if (busy || !sources.length) return;
  const span = Number(el<HTMLInputElement>('manageSpan').value);
  if (mode === 'split' && (!Number.isInteger(span) || span < 1 || span >= sources[0].pages)) {
    const box = el<HTMLDivElement>('manageError');
    box.textContent = '每份页数必须大于 0 且小于总页数。'; box.hidden = false; return;
  }
  busy = true;
  renderFiles();
  el<HTMLButtonElement>('managePick').disabled = true;
  el<HTMLDivElement>('manageError').hidden = true;
  el<HTMLDivElement>('manageResult').hidden = true;
  const status = el<HTMLDivElement>('manageStatus');
  status.textContent = '正在处理 PDF…'; status.hidden = false;
  try {
    const result = mode === 'merge' ? await PDFManageService.MergePDFs(order) : mode === 'split' ? await PDFManageService.SplitPDF(span) : await PDFManageService.CompressPDF();
    if (!result.location) return;
    const title = el<HTMLElement>('manageResultTitle');
    if (mode === 'merge') title.textContent = `已合并 ${result.count} 个 PDF · ${size(result.bytes)}`;
    if (mode === 'split') title.textContent = `已拆分为 ${result.count} 份 PDF`;
    if (mode === 'compress') {
      const difference = sources[0].bytes - result.bytes;
      title.textContent = difference > 0 ? `压缩完成 · 减少 ${size(difference)}` : '优化完成 · 文件体积未减小';
    }
    el<HTMLElement>('manageResultPath').textContent = result.location;
    el<HTMLDivElement>('manageResult').hidden = false;
  } catch (error) {
    const box = el<HTMLDivElement>('manageError');
    box.textContent = `处理失败：${message(error)}`; box.hidden = false;
  } finally {
    busy = false;
    status.hidden = true;
    el<HTMLButtonElement>('managePick').disabled = false;
    renderFiles();
  }
}

/** Wires the PDF management controls after the shell has rendered. */
export function setupPDFManageTool(): void {
  document.querySelectorAll<HTMLButtonElement>('.manage-tab').forEach((tab) => tab.addEventListener('click', () => selectMode(tab.dataset.mode as Mode)));
  el<HTMLButtonElement>('managePick').addEventListener('click', () => void pickFiles());
  el<HTMLButtonElement>('manageRun').addEventListener('click', () => void run());
  el<HTMLButtonElement>('manageOpenFolder').addEventListener('click', async () => {
    try { await PDFManageService.OpenPDFOutputFolder(); }
    catch (error) { const box = el<HTMLDivElement>('manageError'); box.textContent = message(error); box.hidden = false; }
  });
  renderFiles();
}
