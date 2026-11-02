import QRCode from 'qrcode';
import { QRCodeService } from '../../../bindings/example.com/pdf-desktop';
import { normalizeWebURL } from './url';

let generated = false;
let busy = false;

/** Returns a required QR code tool element. */
function qrElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`缺少二维码界面元素：${id}`);
  return element as T;
}

/** Converts an unknown error into readable text. */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : '操作失败，请重试';
}

/** Hides the previous code when its content or size changes. */
function invalidate(): void {
  generated = false;
  qrElement<HTMLCanvasElement>('qrCanvas').hidden = true;
  qrElement<HTMLDivElement>('qrEmpty').hidden = false;
  qrElement<HTMLButtonElement>('qrSave').disabled = true;
  qrElement<HTMLDivElement>('qrResult').hidden = true;
  qrElement<HTMLDivElement>('qrError').hidden = true;
  qrElement<HTMLDivElement>('qrSaveError').hidden = true;
  qrElement<HTMLElement>('qrEncodedURL').textContent = '网址将显示在这里';
}

/** Draws a high contrast QR code from the validated URL. */
async function generate(): Promise<void> {
  if (busy) return;
  const box = qrElement<HTMLDivElement>('qrError');
  box.hidden = true;
  try {
    const url = normalizeWebURL(qrElement<HTMLInputElement>('qrURL').value);
    const size = Number(document.querySelector<HTMLInputElement>('input[name="qrSize"]:checked')?.value);
    if (![512, 1024, 2048].includes(size)) throw new Error('请选择图片尺寸');
    busy = true;
    qrElement<HTMLButtonElement>('qrGenerate').disabled = true;
    const canvas = qrElement<HTMLCanvasElement>('qrCanvas');
    await QRCode.toCanvas(canvas, url, { width: size, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#111827', light: '#ffffffff' } });
    canvas.style.removeProperty('width');
    canvas.style.removeProperty('height');
    generated = true;
    canvas.hidden = false;
    qrElement<HTMLDivElement>('qrEmpty').hidden = true;
    qrElement<HTMLElement>('qrEncodedURL').textContent = url;
    qrElement<HTMLElement>('qrEncodedURL').title = url;
    qrElement<HTMLElement>('qrPreviewSize').textContent = `${canvas.width} × ${canvas.height} PNG`;
    qrElement<HTMLButtonElement>('qrSave').disabled = false;
    qrElement<HTMLDivElement>('qrResult').hidden = true;
  } catch (error) {
    invalidate();
    box.textContent = errorText(error);
    box.hidden = false;
  } finally {
    busy = false;
    qrElement<HTMLButtonElement>('qrGenerate').disabled = false;
  }
}

/** Saves the generated QR code through the native file dialog. */
async function save(): Promise<void> {
  if (!generated || busy) return;
  busy = true;
  const button = qrElement<HTMLButtonElement>('qrSave');
  button.disabled = true;
  qrElement<HTMLDivElement>('qrSaveError').hidden = true;
  try {
    const encoded = qrElement<HTMLCanvasElement>('qrCanvas').toDataURL('image/png');
    const path = await QRCodeService.SaveQRCode(encoded);
    if (path) {
      qrElement<HTMLElement>('qrResultPath').textContent = path;
      qrElement<HTMLDivElement>('qrResult').hidden = false;
    }
  } catch (error) {
    const box = qrElement<HTMLDivElement>('qrSaveError');
    box.textContent = `保存失败：${errorText(error)}`;
    box.hidden = false;
  } finally {
    busy = false;
    button.disabled = !generated;
  }
}

/** Connects URL input, size choices, generation, and save actions. */
export function setupQRCodeTool(): void {
  const input = qrElement<HTMLInputElement>('qrURL');
  input.addEventListener('input', invalidate);
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') void generate(); });
  document.querySelectorAll<HTMLInputElement>('input[name="qrSize"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('.qr-size-choices .choice').forEach((choice) => choice.classList.toggle('selected', Boolean(choice.querySelector<HTMLInputElement>('input')?.checked)));
    invalidate();
  }));
  qrElement<HTMLButtonElement>('qrGenerate').addEventListener('click', () => void generate());
  qrElement<HTMLButtonElement>('qrSave').addEventListener('click', () => void save());
  qrElement<HTMLButtonElement>('qrOpenFolder').addEventListener('click', async () => {
    try { await QRCodeService.OpenQRCodeOutputFolder(); }
    catch (error) { const box = qrElement<HTMLDivElement>('qrSaveError'); box.textContent = errorText(error); box.hidden = false; }
  });
}
