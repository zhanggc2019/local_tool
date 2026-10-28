import { PhotoService } from '../../../bindings/example.com/pdf-desktop';
import { cutOutPerson, encodePhoto, renderPhoto, type PhotoColor, type PhotoSize } from './processor';

let personCanvas: HTMLCanvasElement | null = null;
let busy = false;
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
async function choosePhoto(file: File): Promise<void> {
  if (busy) return;
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
  } catch (error) {
    showPhotoError(`处理照片失败：${photoErrorText(error)}`);
  } finally {
    busy = false;
    setPhotoStatus('');
    photoElement<HTMLButtonElement>('photoSave').disabled = !personCanvas;
  }
}

/** Saves the exact preview pixels as a validated 300 DPI JPEG. */
async function savePhoto(): Promise<void> {
  if (!personCanvas || busy) return;
  busy = true;
  clearPhotoError();
  photoElement<HTMLButtonElement>('photoSave').disabled = true;
  try {
    updatePhotoPreview();
    const encoded = encodePhoto(photoElement<HTMLCanvasElement>('photoCanvas'));
    const path = await PhotoService.SavePhoto(selected('photoSize'), selected('photoColor'), encoded);
    if (path) {
      photoElement<HTMLElement>('photoResultPath').textContent = path;
      photoElement<HTMLDivElement>('photoResult').hidden = false;
    }
  } catch (error) {
    showPhotoError(`保存失败：${photoErrorText(error)}`);
  } finally {
    busy = false;
    photoElement<HTMLButtonElement>('photoSave').disabled = !personCanvas;
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
  const input = photoElement<HTMLInputElement>('photoInput');
  photoElement<HTMLButtonElement>('photoPick').addEventListener('click', () => { if (!busy) { input.value = ''; input.click(); } });
  photoElement<HTMLButtonElement>('photoReplace').addEventListener('click', () => { if (!busy) { input.value = ''; input.click(); } });
  input.addEventListener('change', () => { if (input.files?.[0]) void choosePhoto(input.files[0]); });
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
