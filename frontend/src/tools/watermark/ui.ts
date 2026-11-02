import { WatermarkService } from '../../../bindings/example.com/pdf-desktop';
import { chooseSources, readSource } from '../source-file';
import type { LocalSource } from '../../../bindings/example.com/pdf-desktop';

type Point = { x: number; y: number };
type Stroke = { width: number; points: Point[] };
let selectedSources: LocalSource[] = [];
let templateStrokes: Stroke[] = [];
let templateSize = { width: 0, height: 0 };
let source: HTMLCanvasElement | null = null;
let mask: HTMLCanvasElement | null = null;
let strokes: Stroke[] = [];
let activeStroke: Stroke | null = null;
let busy = false;
let selecting = false;
let repaired = false;
let showingBefore = false;
let original: ImageData | null = null;

/** Returns a required watermark tool element. */
function item<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少图片修复界面元素：${id}`);
  return node as T;
}

/** Shows an error in the tool's own status area. */
function showError(error: unknown): void {
  const box = item<HTMLDivElement>('watermarkError');
  box.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : '操作失败，请重试';
  box.hidden = false;
}

/** Enables controls according to the image and current selection. */
function refreshControls(): void {
  const ready = !!source && !busy;
  item<HTMLButtonElement>('watermarkUndo').disabled = !ready || !strokes.length;
  item<HTMLButtonElement>('watermarkClear').disabled = !ready || !strokes.length;
  item<HTMLButtonElement>('watermarkBefore').disabled = !ready || !original;
  item<HTMLButtonElement>('watermarkRepair').disabled = !ready || !strokes.length;
  item<HTMLButtonElement>('watermarkSave').disabled = !ready || !repaired || !selectedSources.length;
  item<HTMLButtonElement>('watermarkReplace').disabled = busy;
}

/** Rebuilds the binary mask from completed and active brush strokes. */
function drawMask(): void {
  if (!mask) return;
  const context = mask.getContext('2d')!;
  context.clearRect(0, 0, mask.width, mask.height);
  context.strokeStyle = '#eb5757';
  context.fillStyle = '#eb5757';
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const stroke of [...strokes, ...(activeStroke ? [activeStroke] : [])]) {
    const first = stroke.points[0];
    if (!first) continue;
    context.lineWidth = stroke.width;
    context.beginPath();
    context.arc(first.x, first.y, stroke.width / 2, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y);
    context.stroke();
  }
}

/** Paints source-relative brush strokes onto a batch image mask. */
function drawBatchMask(canvas: HTMLCanvasElement): Uint8Array {
  const context = canvas.getContext('2d')!;
  const scaleX = canvas.width / templateSize.width;
  const scaleY = canvas.height / templateSize.height;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#ff0000'; context.fillStyle = '#ff0000';
  context.lineCap = 'round'; context.lineJoin = 'round';
  for (const stroke of templateStrokes) {
    const first = stroke.points[0];
    if (!first) continue;
    context.lineWidth = stroke.width * Math.max(scaleX, scaleY);
    context.beginPath();
    context.arc(first.x * scaleX, first.y * scaleY, context.lineWidth / 2, 0, Math.PI * 2);
    context.fill();
    context.beginPath(); context.moveTo(first.x * scaleX, first.y * scaleY);
    for (const point of stroke.points.slice(1)) context.lineTo(point.x * scaleX, point.y * scaleY);
    context.stroke();
  }
  const alpha = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const bits = new Uint8Array(canvas.width * canvas.height);
  for (let index = 0; index < bits.length; index++) bits[index] = alpha[index * 4 + 3] > 0 ? 1 : 0;
  return bits;
}

/** Runs the existing local inpainting worker for one image and mask. */
async function inpaint(pixels: ImageData, bits: Uint8Array, radius: number): Promise<ImageData> {
  return new Promise<ImageData>((resolve, reject) => {
    const worker = new Worker(new URL('./inpaint.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ result?: ImageData; error?: string }>) => {
      worker.terminate();
      if (event.data.result) resolve(event.data.result);
      else reject(new Error(event.data.error || '修复失败'));
    };
    worker.onerror = () => { worker.terminate(); reject(new Error('修复进程意外停止')); };
    worker.postMessage({ image: pixels, mask: bits, radius }, [pixels.data.buffer, bits.buffer]);
  });
}

/** Renders the image and a translucent red selection overlay. */
function render(): void {
  if (!source || !mask) return;
  const canvas = item<HTMLCanvasElement>('watermarkCanvas');
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (showingBefore && original) context.putImageData(original, 0, 0);
  else context.drawImage(source, 0, 0);
  if (!showingBefore && (strokes.length || activeStroke)) {
    drawMask();
    context.save();
    context.globalAlpha = 0.42;
    context.globalCompositeOperation = 'source-over';
    context.drawImage(mask, 0, 0);
    context.restore();
  }
}

/** Fits the full image inside the preview without changing its pixel data. */
function fitCanvas(): void {
  const canvas = item<HTMLCanvasElement>('watermarkCanvas');
  const stage = item<HTMLDivElement>('watermarkStage');
  if (!canvas.width || !canvas.height) return;
  const scale = Math.min(1, (stage.clientWidth - 26) / canvas.width, (stage.clientHeight - 26) / canvas.height);
  canvas.style.width = `${Math.round(canvas.width * scale)}px`;
  canvas.style.height = `${Math.round(canvas.height * scale)}px`;
}

/** Loads a local image while preserving its original pixel dimensions. */
async function choose(file: File): Promise<boolean> {
  if (busy) return false;
  item<HTMLDivElement>('watermarkError').hidden = true;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { showError('请选择 JPG、PNG 或 WebP 图片'); return false; }
  if (file.size > 20 * 1024 * 1024) { showError('图片不能超过 20 MB'); return false; }
  busy = true; refreshControls();
  try {
    const bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > 16000000) { bitmap.close(); throw new Error('图片超过 1600 万像素限制'); }
    const next = document.createElement('canvas');
    next.width = bitmap.width; next.height = bitmap.height;
    next.getContext('2d', { willReadFrequently: true })!.drawImage(bitmap, 0, 0);
    bitmap.close();
    source = next;
    mask = document.createElement('canvas');
    mask.width = next.width; mask.height = next.height;
    original = next.getContext('2d')!.getImageData(0, 0, next.width, next.height);
    const canvas = item<HTMLCanvasElement>('watermarkCanvas');
    canvas.width = next.width; canvas.height = next.height;
    strokes = []; templateStrokes = []; templateSize = { width: next.width, height: next.height }; activeStroke = null; repaired = false;
    item<HTMLElement>('watermarkFileName').textContent = `${file.name} · ${next.width} × ${next.height}`;
    item<HTMLDivElement>('watermarkEmpty').hidden = true;
    item<HTMLDivElement>('watermarkEditor').hidden = false;
    item<HTMLButtonElement>('watermarkReplace').hidden = false;
    item<HTMLDivElement>('watermarkResult').hidden = true;
    fitCanvas();
    render();
    return true;
  } catch (error) { showError(error); return false; }
  finally { busy = false; refreshControls(); }
}

/** Selects native images and displays the first batch member for mask editing. */
async function chooseNativeImages(): Promise<void> {
  if (busy || selecting) return;
  selecting = true;
  try {
    const picked = await chooseSources('watermark', item<HTMLInputElement>('watermarkBatch').checked);
    if (!picked?.length) return;
    selectedSources = [];
    item<HTMLDivElement>('watermarkQueue').hidden = true;
    refreshControls();
    if (!await choose(await readSource('watermark', 0, picked[0]))) return;
    selectedSources = picked;
    refreshControls();
    const queue = item<HTMLDivElement>('watermarkQueue');
    queue.textContent = picked.length > 1 ? `已选择 ${picked.length} 张图片 · 首张图的涂选位置按比例应用于全部图片` : '输出默认保存在原图片所在文件夹';
    queue.hidden = false;
  } catch (error) { showError(error); }
  finally { selecting = false; }
}

/** Maps a pointer event to pixel coordinates in the original image. */
function point(event: PointerEvent): Point {
  const canvas = item<HTMLCanvasElement>('watermarkCanvas');
  const rect = canvas.getBoundingClientRect();
  return { x: Math.max(0, Math.min(canvas.width - 1, (event.clientX - rect.left) * canvas.width / rect.width)), y: Math.max(0, Math.min(canvas.height - 1, (event.clientY - rect.top) * canvas.height / rect.height)) };
}

/** Begins a brush stroke on the selected image. */
function startStroke(event: PointerEvent): void {
  if (!source || busy || showingBefore) return;
  const canvas = item<HTMLCanvasElement>('watermarkCanvas');
  activeStroke = { width: Number(item<HTMLInputElement>('watermarkBrush').value), points: [point(event)] };
  canvas.setPointerCapture(event.pointerId);
  render();
}

/** Extends a brush stroke while the pointer is captured. */
function moveStroke(event: PointerEvent): void {
  if (!activeStroke) return;
  activeStroke.points.push(point(event));
  render();
}

/** Completes an active brush stroke for undo support. */
function finishStroke(): void {
  if (!activeStroke) return;
  strokes.push(activeStroke);
  activeStroke = null;
  render(); refreshControls();
}

/** Runs local inpainting in a worker and applies the repaired pixels. */
async function repair(): Promise<void> {
  if (!source || !mask || busy || !strokes.length) return;
  busy = true; refreshControls();
  item<HTMLDivElement>('watermarkError').hidden = true;
  const status = item<HTMLDivElement>('watermarkStatus');
  status.textContent = '正在本机修复选区…'; status.hidden = false;
  try {
    drawMask();
    const selection = mask.getContext('2d')!.getImageData(0, 0, mask.width, mask.height).data;
    const bits = new Uint8Array(mask.width * mask.height);
    for (let index = 0; index < bits.length; index++) bits[index] = selection[index * 4 + 3] > 0 ? 1 : 0;
    const pixels = source.getContext('2d')!.getImageData(0, 0, source.width, source.height);
    const result = await inpaint(pixels, bits, Math.max(28, Number(item<HTMLInputElement>('watermarkBrush').value) * 2));
    source.getContext('2d')!.putImageData(result, 0, 0);
    templateStrokes.push(...strokes);
    strokes = []; activeStroke = null; repaired = true;
    item<HTMLDivElement>('watermarkResult').hidden = true;
    render();
  } catch (error) { showError(error); }
  finally { busy = false; status.hidden = true; refreshControls(); }
}

/** Saves the repaired image in the selected output format. */
async function save(): Promise<void> {
  if (!source || !repaired || busy || selecting || !selectedSources.length) return;
  busy = true; refreshControls();
  item<HTMLDivElement>('watermarkError').hidden = true;
  try {
    const format = item<HTMLSelectElement>('watermarkFormat').value;
    const radius = Math.max(28, Number(item<HTMLInputElement>('watermarkBrush').value) * 2);
    let completed = 0;
    let lastPath = '';
    const failures: string[] = [];
    for (let index = 0; index < selectedSources.length; index++) {
      const member = selectedSources[index];
      let image = index === 0 ? source : document.createElement('canvas');
      try {
        if (index > 0) {
          const bitmap = await createImageBitmap(await readSource('watermark', index, member));
          if (bitmap.width * bitmap.height > 16000000) { bitmap.close(); throw new Error('图片超过 1600 万像素限制'); }
          image.width = bitmap.width; image.height = bitmap.height;
          image.getContext('2d', { willReadFrequently: true })!.drawImage(bitmap, 0, 0);
          bitmap.close();
          const batchMask = document.createElement('canvas');
          batchMask.width = image.width; batchMask.height = image.height;
          const bits = drawBatchMask(batchMask);
          batchMask.width = 0; batchMask.height = 0;
          const pixels = image.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, image.width, image.height);
          const fixed = await inpaint(pixels, bits, radius);
          image.getContext('2d')!.putImageData(fixed, 0, 0);
        }
        const output = document.createElement('canvas');
        output.width = image.width; output.height = image.height;
        const context = output.getContext('2d')!;
        if (format === 'jpeg') { context.fillStyle = '#fff'; context.fillRect(0, 0, output.width, output.height); }
        context.drawImage(image, 0, 0);
        const encoded = output.toDataURL(format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.92);
        lastPath = await WatermarkService.SaveRepairedImageBesideSource(member.path, format, encoded);
        output.width = 0; output.height = 0;
        completed++;
      } catch (error) { failures.push(`${member.name}：${error instanceof Error ? error.message : String(error)}`); }
      finally { if (index > 0) { image.width = 0; image.height = 0; } }
      item<HTMLDivElement>('watermarkStatus').textContent = `已处理 ${index + 1} / ${selectedSources.length} 张图片`;
      item<HTMLDivElement>('watermarkStatus').hidden = false;
    }
    item<HTMLElement>('watermarkResultTitle').textContent = `已保存 ${completed} / ${selectedSources.length} 张图片`;
    item<HTMLElement>('watermarkPath').textContent = selectedSources.length === 1 ? lastPath : '结果位于各原图片所在文件夹';
    item<HTMLButtonElement>('watermarkOpenFolder').textContent = selectedSources.length > 1 ? '打开最近结果' : '打开文件夹';
    item<HTMLDivElement>('watermarkResult').hidden = completed === 0;
    if (failures.length) showError(`失败 ${failures.length} 张：${failures.join('；')}`);
  } catch (error) { showError(error); }
  finally { busy = false; item<HTMLDivElement>('watermarkStatus').hidden = true; refreshControls(); }
}

/** Connects the image picker, mask brush, repair, and save controls. */
export function setupWatermarkTool(): void {
  item<HTMLButtonElement>('watermarkChoose').addEventListener('click', () => void chooseNativeImages());
  item<HTMLButtonElement>('watermarkReplace').addEventListener('click', () => void chooseNativeImages());
  item<HTMLInputElement>('watermarkBatch').addEventListener('change', (event) => { const toggle = event.target as HTMLInputElement; if (busy || selecting) { toggle.checked = !toggle.checked; return; } selectedSources = []; if (source) { source.width = 0; source.height = 0; } source = null; mask = null; original = null; strokes = []; templateStrokes = []; repaired = false; item<HTMLDivElement>('watermarkEditor').hidden = true; item<HTMLDivElement>('watermarkEmpty').hidden = false; item<HTMLDivElement>('watermarkQueue').hidden = true; refreshControls(); });
  const canvas = item<HTMLCanvasElement>('watermarkCanvas');
  canvas.addEventListener('pointerdown', startStroke);
  canvas.addEventListener('pointermove', moveStroke);
  canvas.addEventListener('pointerup', finishStroke);
  canvas.addEventListener('pointercancel', finishStroke);
  item<HTMLInputElement>('watermarkBrush').addEventListener('input', (event) => { item<HTMLElement>('watermarkBrushValue').textContent = `${(event.target as HTMLInputElement).value} px`; });
  item<HTMLButtonElement>('watermarkUndo').addEventListener('click', () => { strokes.pop(); render(); refreshControls(); });
  item<HTMLButtonElement>('watermarkClear').addEventListener('click', () => { strokes = []; render(); refreshControls(); });
  const before = item<HTMLButtonElement>('watermarkBefore');
  before.addEventListener('pointerdown', () => { showingBefore = true; render(); });
  for (const name of ['pointerup', 'pointercancel', 'pointerleave']) before.addEventListener(name, () => { showingBefore = false; render(); });
  before.addEventListener('keydown', (event) => { if (event.key === ' ' || event.key === 'Enter') { showingBefore = true; render(); } });
  before.addEventListener('keyup', () => { showingBefore = false; render(); });
  item<HTMLButtonElement>('watermarkRepair').addEventListener('click', () => void repair());
  item<HTMLButtonElement>('watermarkSave').addEventListener('click', () => void save());
  item<HTMLButtonElement>('watermarkOpenFolder').addEventListener('click', async () => { try { await WatermarkService.OpenWatermarkOutputFolder(); } catch (error) { showError(error); } });
  window.addEventListener('resize', fitCanvas);
  refreshControls();
}
