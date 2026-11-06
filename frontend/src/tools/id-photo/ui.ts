import { PhotoService } from '../../../bindings/example.com/pdf-desktop/internal/app';
import { cutOutPerson, encodePhoto, encodePhotoPNG, renderPhoto, type PhotoColor, type PhotoSize } from './processor';
import { chooseSources, readSource } from '../source-file';
import type { LocalSource } from '../../../bindings/example.com/pdf-desktop/internal/app';

let personCanvas: HTMLCanvasElement | null = null;
let selectedSources: LocalSource[] = [];
let busy = false;
let selecting = false;
let panX = 0;
let panY = 0;
let dragStart: { x: number; y: number; panX: number; panY: number } | null = null;

/** Returns a required ID photo view element. */
function photoElement<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`缺少证件照界面元素：${id}`);
  return found as T;
}

/** Reads a selected radio value from the photo settings. */
function selected(name: string): string {
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
  if (!input) throw new Error('证件照设置不完整');
  return input.value;
}

/** Turns unknown thrown values into concise user-facing text. */
function photoErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '操作失败，请重试';
}

/** Displays a photo-tool error in its own status area. */
function showPhotoError(message: string): void {
  const box = photoElement<HTMLDivElement>('photoError');
  box.textContent = message;
  box.hidden = false;
}

/** Clears an old photo-tool error before a new operation. */
function clearPhotoError(): void {
  photoElement<HTMLDivElement>('photoError').hidden = true;
}

/** Updates the loading message while the local model processes an image. */
function setPhotoStatus(message: string): void {
  const status = photoElement<HTMLDivElement>('photoStatus');
  status.textContent = message;
  status.hidden = message === '';
}

/** Mirrors radio selection in the photo size and color cards. */
function refreshPhotoChoices(): void {
  document.querySelectorAll<HTMLElement>('.photo-size-choice,.photo-color-choice').forEach((label) => {
    label.classList.toggle('selected', Boolean(label.querySelector<HTMLInputElement>('input')?.checked));
  });
}

/** Renders the current cutout with the selected crop, size, and background. */
function updatePhotoPreview(): void {
  if (!personCanvas) return;
  const zoom = Number(photoElement<HTMLInputElement>('photoZoom').value) / 100;
  const placement = renderPhoto(personCanvas, photoElement<HTMLCanvasElement>('photoCanvas'), selected('photoSize') as PhotoSize, selected('photoColor') as PhotoColor, zoom, panX, panY);
  panX = placement.panX;
  panY = placement.panY;
  photoElement<HTMLElement>('photoZoomValue').textContent = `${Math.round(zoom * 100)}%`;
  photoElement<HTMLDivElement>('photoResult').hidden = true;
}

/** Loads one local image and creates its transparent person layer. */
async function choosePhoto(file: File): Promise<boolean> {
  if (busy) return false;
  busy = true;
  clearPhotoError();
  photoElement<HTMLDivElement>('photoResult').hidden = true;
  photoElement<HTMLButtonElement>('photoSave').disabled = true;
  setPhotoStatus('正在本机识别人像，首次使用会加载模型…');
  try {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const cutout = await cutOutPerson(file);
    if (personCanvas) {
      personCanvas.width = 0;
      personCanvas.height = 0;
    }
    personCanvas = cutout;
    panX = 0;
    panY = 0;
    const zoom = photoElement<HTMLInputElement>('photoZoom');
    zoom.value = '100';
    zoom.disabled = false;
    photoElement<HTMLElement>('photoFileName').textContent = file.name;
    photoElement<HTMLButtonElement>('photoReplace').hidden = false;
    photoElement<HTMLDivElement>('photoEmpty').hidden = true;
    photoElement<HTMLDivElement>('photoEditor').hidden = false;
    updatePhotoPreview();
    return true;
  } catch (error) {
    showPhotoError(`处理照片失败：${photoErrorText(error)}`);
    return false;
  } finally {
    busy = false;
    setPhotoStatus('');
    photoElement<HTMLButtonElement>('photoSave').disabled = !personCanvas || !selectedSources.length;
  }
}

/** Selects native image files and previews the first portrait. */
async function chooseNativePhotos(): Promise<void> {
  if (busy || selecting) return;
  selecting = true;
  try {
    const picked = await chooseSources('photo', photoElement<HTMLInputElement>('photoBatch').checked);
    if (!picked?.length) return;
    selectedSources = [];
    photoElement<HTMLDivElement>('photoQueue').hidden = true;
    photoElement<HTMLButtonElement>('photoSave').disabled = true;
    if (!await choosePhoto(await readSource('photo', 0, picked[0]))) return;
    selectedSources = picked;
    photoElement<HTMLButtonElement>('photoSave').disabled = false;
    const queue = photoElement<HTMLDivElement>('photoQueue');
    queue.textContent = picked.length > 1 ? `已选择 ${picked.length} 张照片 · 使用相同尺寸、背景和构图，逐张保存到原文件夹` : '输出默认保存在原照片所在文件夹';
    queue.hidden = false;
  } catch (error) { showPhotoError(`读取照片失败：${photoErrorText(error)}`); }
  finally { selecting = false; }
}

/** Saves the exact preview pixels as validated 300 DPI JPG and PNG files. */
async function savePhoto(): Promise<void> {
  if (!personCanvas || busy || selecting || !selectedSources.length) return;
  busy = true;
  clearPhotoError();
  photoElement<HTMLButtonElement>('photoSave').disabled = true;
  try {
    const size = selected('photoSize') as PhotoSize;
    const color = selected('photoColor') as PhotoColor;
    const zoom = Number(photoElement<HTMLInputElement>('photoZoom').value) / 100;
    const offsetX = panX;
    const offsetY = panY;
    const failures: string[] = [];
    let completed = 0;
    let lastPath = '';
    for (let index = 0; index < selectedSources.length; index++) {
      const source = selectedSources[index];
      let cutout: HTMLCanvasElement | null = null;
      try {
        cutout = index === 0 ? personCanvas : await cutOutPerson(await readSource('photo', index, source));
        const output = document.createElement('canvas');
        renderPhoto(cutout, output, size, color, zoom, offsetX, offsetY);
        const result = await PhotoService.SavePhotoBesideSource(source.path, size, color, encodePhoto(output), encodePhotoPNG(output));
        lastPath = result.jpg;
        output.width = 0; output.height = 0;
        completed++;
      } catch (error) { failures.push(`${source.name}：${photoErrorText(error)}`); }
      finally { if (index > 0 && cutout) { cutout.width = 0; cutout.height = 0; } }
      setPhotoStatus(`已处理 ${index + 1} / ${selectedSources.length} 张照片`);
    }
    photoElement<HTMLElement>('photoResultPath').textContent = selectedSources.length === 1 ? lastPath : '结果位于各原照片所在文件夹';
    photoElement<HTMLButtonElement>('photoOpenFolder').textContent = selectedSources.length > 1 ? '打开最近结果' : '打开文件夹';
    photoElement<HTMLDivElement>('photoResult').hidden = completed === 0;
    photoElement<HTMLElement>('photoResultPath').previousElementSibling!.textContent = `已保存 ${completed} / ${selectedSources.length} 张证件照（JPG + PNG）`;
    if (failures.length) showPhotoError(`失败 ${failures.length} 张：${failures.join('；')}`);
  } catch (error) {
    showPhotoError(`保存失败：${photoErrorText(error)}`);
  } finally {
    busy = false;
    photoElement<HTMLButtonElement>('photoSave').disabled = !personCanvas || !selectedSources.length;
  }
}

/** Starts repositioning the preview image with a pointer. */
function startPhotoDrag(event: PointerEvent): void {
  if (!personCanvas || busy) return;
  const canvas = photoElement<HTMLCanvasElement>('photoCanvas');
  dragStart = { x: event.clientX, y: event.clientY, panX, panY };
  canvas.setPointerCapture(event.pointerId);
}

/** Applies pointer movement as normalized crop offsets. */
function movePhotoDrag(event: PointerEvent): void {
  if (!dragStart) return;
  const rect = photoElement<HTMLCanvasElement>('photoCanvas').getBoundingClientRect();
  panX = dragStart.panX + (event.clientX - dragStart.x) / rect.width;
  panY = dragStart.panY + (event.clientY - dragStart.y) / rect.height;
  updatePhotoPreview();
}

/** Ends an active crop drag without changing the chosen photo. */
function stopPhotoDrag(): void {
  dragStart = null;
}

/** Attaches file, crop, color, size, and export controls to the photo tool. */
export function setupPhotoTool(): void {
  photoElement<HTMLButtonElement>('photoPick').addEventListener('click', () => void chooseNativePhotos());
  photoElement<HTMLButtonElement>('photoReplace').addEventListener('click', () => void chooseNativePhotos());
  photoElement<HTMLInputElement>('photoBatch').addEventListener('change', (event) => { const toggle = event.target as HTMLInputElement; if (busy || selecting) { toggle.checked = !toggle.checked; return; } selectedSources = []; if (personCanvas) { personCanvas.width = 0; personCanvas.height = 0; } personCanvas = null; photoElement<HTMLDivElement>('photoEditor').hidden = true; photoElement<HTMLDivElement>('photoEmpty').hidden = false; photoElement<HTMLDivElement>('photoQueue').hidden = true; photoElement<HTMLButtonElement>('photoSave').disabled = true; });
  document.querySelectorAll<HTMLInputElement>('input[name="photoSize"],input[name="photoColor"]').forEach((radio) => {
    radio.addEventListener('change', () => { refreshPhotoChoices(); clearPhotoError(); updatePhotoPreview(); });
  });
  photoElement<HTMLInputElement>('photoZoom').addEventListener('input', () => { clearPhotoError(); updatePhotoPreview(); });
  const canvas = photoElement<HTMLCanvasElement>('photoCanvas');
  canvas.addEventListener('pointerdown', startPhotoDrag);
  canvas.addEventListener('pointermove', movePhotoDrag);
  canvas.addEventListener('pointerup', stopPhotoDrag);
  canvas.addEventListener('pointercancel', stopPhotoDrag);
  photoElement<HTMLButtonElement>('photoSave').addEventListener('click', () => void savePhoto());
  photoElement<HTMLButtonElement>('photoOpenFolder').addEventListener('click', async () => {
    try { await PhotoService.OpenPhotoOutputFolder(); }
    catch (error) { showPhotoError(`无法打开文件夹：${photoErrorText(error)}`); }
  });
}
