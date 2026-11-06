import { GeneratedImageService, type LocalSource } from '../../../bindings/example.com/pdf-desktop/internal/app';
import { chooseSources, readSource } from '../source-file';
import {
  createStitchCanvas,
  drawStitchSlice,
  encodeStitch,
  planStitch,
  type ImageSize,
  type StitchFormat,
  type StitchPlan,
} from './processor';

interface StitchEntry { source: LocalSource; size: ImageSize }

let entries: StitchEntry[] = [];
let order: number[] = [];
let busy = false;

/** Finds one required long-image element. */
function stitchEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少长图拼接界面元素：${id}`);
  return node as T;
}

/** Displays one native or validation error using text content only. */
function stitchError(error: unknown): void {
  const box = stitchEl<HTMLDivElement>('stitchError');
  box.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : '长图拼接失败';
  box.hidden = false;
}

/** Reads the selected target width and gap. */
function readLayout(): { targetWidth: number; gap: number } {
  return {
    targetWidth: Number(document.querySelector<HTMLInputElement>('input[name="stitchWidth"]:checked')?.value ?? 0),
    gap: Number(document.querySelector<HTMLInputElement>('input[name="stitchGap"]:checked')?.value ?? 8),
  };
}

/** Reads the output format. */
function currentFormat(): StitchFormat {
  return document.querySelector<HTMLInputElement>('input[name="stitchFormat"]:checked')?.value === 'png' ? 'png' : 'jpeg';
}

/** Builds the current plan or null when the selection is invalid. */
function currentPlan(): StitchPlan | null {
  if (!entries.length) return null;
  const layout = readLayout();
  try {
    return planStitch(order.map((index) => entries[index].size), layout.targetWidth, layout.gap);
  } catch {
    return null;
  }
}

/** Updates the dimension hint and enabled state. */
function renderStitchHint(): void {
  const hint = stitchEl<HTMLDivElement>('stitchHint');
  if (!entries.length) {
    hint.textContent = '选择图片后显示预计长图尺寸。';
    stitchEl<HTMLButtonElement>('stitchRun').disabled = true;
    return;
  }
  const layout = readLayout();
  try {
    const plan = planStitch(order.map((index) => entries[index].size), layout.targetWidth, layout.gap);
    const megapixels = (plan.width * plan.totalHeight) / 1_000_000;
    hint.textContent = `预计 ${plan.width} × ${plan.totalHeight} px · 约 ${megapixels.toFixed(1)} 百万像素`;
    stitchEl<HTMLButtonElement>('stitchRun').disabled = busy;
  } catch (error) {
    hint.textContent = error instanceof Error ? error.message : '拼接参数无效';
    stitchEl<HTMLButtonElement>('stitchRun').disabled = true;
  }
}

/** Updates the ordered file list with move buttons and dimensions. */
function renderStitchFiles(): void {
  const list = stitchEl<HTMLOListElement>('stitchFiles');
  list.replaceChildren();
  order.forEach((entryIndex, position) => {
    const entry = entries[entryIndex];
    const item = document.createElement('li');
    item.className = 'video-file image-pdf-item';
    const copy = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = entry.source.name;
    name.title = entry.source.path;
    const detail = document.createElement('small');
    detail.textContent = `第 ${position + 1} 张 · ${entry.size.width}×${entry.size.height}`;
    copy.append(name, detail);
    const moves = document.createElement('div');
    moves.className = 'image-pdf-moves';
    const up = document.createElement('button');
    up.type = 'button';
    up.textContent = '上移';
    up.disabled = position === 0;
    up.addEventListener('click', () => {
      [order[position - 1], order[position]] = [order[position], order[position - 1]];
      renderStitchFiles();
    });
    const down = document.createElement('button');
    down.type = 'button';
    down.textContent = '下移';
    down.disabled = position === order.length - 1;
    down.addEventListener('click', () => {
      [order[position + 1], order[position]] = [order[position], order[position + 1]];
      renderStitchFiles();
    });
    moves.append(up, down);
    item.append(copy, moves);
    list.append(item);
  });
  list.hidden = entries.length === 0;
  stitchEl<HTMLDivElement>('stitchEmpty').hidden = entries.length > 0;
  renderStitchHint();
}

/** Measures every selected image before stitching. */
async function measureEntry(source: LocalSource, index: number): Promise<StitchEntry> {
  const file = await readSource('stitch', index, source);
  const bitmap = await createImageBitmap(file);
  try {
    return { source, size: { width: bitmap.width, height: bitmap.height } };
  } finally {
    bitmap.close();
  }
}

/** Opens the native selector and measures the images in selection order. */
async function chooseStitchImages(): Promise<void> {
  if (busy) return;
  stitchEl<HTMLDivElement>('stitchError').hidden = true;
  try {
    const selected = await chooseSources('stitch', true);
    if (!selected?.length) return;
    if (selected.length < 2) throw new Error('长图拼接至少需要两张图片');
    stitchEl<HTMLDivElement>('stitchResult').hidden = true;
    entries = [];
    for (let index = 0; index < selected.length; index++) {
      entries.push(await measureEntry(selected[index], index));
    }
    order = selected.map((_, index) => index);
    renderStitchFiles();
  } catch (error) { stitchError(error); }
}

/** Stitches the ordered images and saves one long image beside the first. */
async function runStitch(): Promise<void> {
  if (busy || !entries.length) return;
  const plan = currentPlan();
  if (!plan) {
    stitchError('拼接参数无效，请检查目标宽度与图片数量');
    return;
  }
  const format = currentFormat();
  busy = true;
  renderStitchHint();
  stitchEl<HTMLButtonElement>('stitchPick').disabled = true;
  stitchEl<HTMLDivElement>('stitchError').hidden = true;
  stitchEl<HTMLDivElement>('stitchResult').hidden = true;
  const status = stitchEl<HTMLDivElement>('stitchStatus');
  try {
    const canvas = createStitchCanvas(plan);
    for (let position = 0; position < order.length; position++) {
      const entry = entries[order[position]];
      status.textContent = `正在拼接 ${position + 1} / ${order.length}：${entry.source.name}`;
      status.hidden = false;
      const file = await readSource('stitch', order[position], entry.source);
      const bitmap = await createImageBitmap(file);
      try {
        drawStitchSlice(canvas, bitmap, plan, position);
      } finally {
        bitmap.close();
      }
    }
    status.textContent = '正在保存长图…';
    const encoded = encodeStitch(canvas, format);
    const path = await GeneratedImageService.SaveGeneratedBesideSource(entries[order[0]].source.path, 'stitch', format, encoded);
    stitchEl<HTMLElement>('stitchResultTitle').textContent = `已拼接 ${order.length} 张 · ${plan.width} × ${plan.totalHeight} px`;
    stitchEl<HTMLElement>('stitchResultPath').textContent = path;
    stitchEl<HTMLDivElement>('stitchResult').hidden = false;
  } catch (error) {
    stitchError(error);
  } finally {
    busy = false;
    status.hidden = true;
    stitchEl<HTMLButtonElement>('stitchPick').disabled = false;
    renderStitchHint();
  }
}

/** Wires selection, layout options, ordering, stitching, and folder opening. */
export function setupImageStitchTool(): void {
  stitchEl<HTMLButtonElement>('stitchPick').addEventListener('click', () => void chooseStitchImages());
  document.querySelectorAll<HTMLInputElement>('input[name="stitchWidth"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('#stitchWidths .choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
    renderStitchHint();
  }));
  document.querySelectorAll<HTMLInputElement>('input[name="stitchGap"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('#stitchGaps .choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
    renderStitchHint();
  }));
  document.querySelectorAll<HTMLInputElement>('input[name="stitchFormat"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('#stitchFormats .format-choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
  }));
  stitchEl<HTMLButtonElement>('stitchRun').addEventListener('click', () => void runStitch());
  stitchEl<HTMLButtonElement>('stitchOpenFolder').addEventListener('click', async () => {
    try { await GeneratedImageService.OpenGeneratedOutputFolder(); }
    catch (error) { stitchError(error); }
  });
  renderStitchHint();
}
