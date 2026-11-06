import { PDFCryptoService, type PDFSource } from '../../../bindings/example.com/pdf-desktop/internal/app';

let source: PDFSource | null = null;
let busy = false;

/** Finds one required PDF crypto element. */
function cryptoEl<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少 PDF 加密界面元素：${id}`);
  return node as T;
}

/** Displays one native or validation error using text content only. */
function cryptoError(error: unknown): void {
  const box = cryptoEl<HTMLDivElement>('cryptoError');
  box.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : '加密操作失败';
  box.hidden = false;
}

/** Reads the encryption password fields. */
function readPasswords(): { user: string; owner: string } {
  return {
    user: cryptoEl<HTMLInputElement>('cryptoUser').value,
    owner: cryptoEl<HTMLInputElement>('cryptoOwner').value,
  };
}

/** Enables buttons according to the selected file and password inputs. */
function renderCryptoState(): void {
  const passwords = readPasswords();
  const encryptBlocked = busy || !source || source.encrypted || passwords.user.length < 4;
  cryptoEl<HTMLButtonElement>('cryptoEncrypt').disabled = encryptBlocked;
  cryptoEl<HTMLButtonElement>('cryptoDecrypt').disabled = busy || !source || !source.encrypted || !cryptoEl<HTMLInputElement>('cryptoPassword').value;
  cryptoEl<HTMLDivElement>('cryptoHint').textContent = !source
    ? '加密与解密都要求输入密码；已加密的 PDF 需先解密才能重新加密。'
    : source.encrypted
      ? '该 PDF 已加密：输入当前密码可解密；如需重新加密，请先解密。'
      : '输入至少 4 个字符的密码后即可加密；所有者密码留空时与打开密码相同。';
}

/** Shows the selected PDF card with its encryption state. */
function renderCryptoFile(): void {
  const card = cryptoEl<HTMLDivElement>('cryptoFile');
  card.replaceChildren();
  if (!source) {
    card.hidden = true;
  } else {
    const name = document.createElement('strong');
    name.textContent = source.name;
    const detail = document.createElement('small');
    detail.textContent = source.encrypted ? '已加密 · 需要密码才能打开' : `共 ${source.pages} 页 · 未加密`;
    card.append(name, detail);
    card.hidden = false;
  }
  cryptoEl<HTMLDivElement>('cryptoEmpty').hidden = source !== null;
  renderCryptoState();
}

/** Opens the native selector for one PDF. */
async function chooseCryptoPDF(): Promise<void> {
  if (busy) return;
  cryptoEl<HTMLDivElement>('cryptoError').hidden = true;
  try {
    const selected = await PDFCryptoService.ChoosePDF();
    if (!selected) return;
    source = selected;
    cryptoEl<HTMLDivElement>('cryptoResult').hidden = true;
    renderCryptoFile();
  } catch (error) { cryptoError(error); }
}

/** Runs one crypto operation with a shared busy/status lifecycle. */
async function runCrypto(statusText: string, action: () => Promise<{ location: string; count: number }>, summary: (count: number) => string): Promise<void> {
  if (busy || !source) return;
  busy = true;
  renderCryptoFile();
  cryptoEl<HTMLDivElement>('cryptoError').hidden = true;
  cryptoEl<HTMLDivElement>('cryptoResult').hidden = true;
  const status = cryptoEl<HTMLDivElement>('cryptoStatus');
  status.textContent = statusText;
  status.hidden = false;
  try {
    const result = await action();
    cryptoEl<HTMLElement>('cryptoResultTitle').textContent = summary(result.count);
    cryptoEl<HTMLElement>('cryptoResultPath').textContent = result.location;
    cryptoEl<HTMLDivElement>('cryptoResult').hidden = false;
  } catch (error) {
    cryptoError(error);
  } finally {
    busy = false;
    status.hidden = true;
    renderCryptoFile();
  }
}

/** Wires selection, password inputs, permissions, and operations. */
export function setupPDFCryptoTool(): void {
  cryptoEl<HTMLButtonElement>('cryptoPick').addEventListener('click', () => void chooseCryptoPDF());
  for (const id of ['cryptoUser', 'cryptoOwner', 'cryptoPassword']) {
    cryptoEl<HTMLInputElement>(id).addEventListener('input', renderCryptoState);
  }
  cryptoEl<HTMLInputElement>('cryptoAllowPrint').addEventListener('change', renderCryptoState);
  cryptoEl<HTMLButtonElement>('cryptoEncrypt').addEventListener('click', () => {
    const passwords = readPasswords();
    void runCrypto(
      '正在加密…',
      () => PDFCryptoService.EncryptPDF(
        passwords.user,
        passwords.owner,
        cryptoEl<HTMLInputElement>('cryptoAllowPrint').checked,
        cryptoEl<HTMLInputElement>('cryptoAllowCopy').checked,
      ),
      (count) => `已加密 ${count} 页 PDF`,
    );
  });
  cryptoEl<HTMLButtonElement>('cryptoDecrypt').addEventListener('click', () => void runCrypto(
    '正在解密…',
    () => PDFCryptoService.DecryptPDF(cryptoEl<HTMLInputElement>('cryptoPassword').value),
    (count) => `已解密 ${count} 页 PDF`,
  ));
  cryptoEl<HTMLButtonElement>('cryptoOpenFolder').addEventListener('click', async () => {
    try { await PDFCryptoService.OpenPDFCryptoOutputFolder(); }
    catch (error) { cryptoError(error); }
  });
  renderCryptoFile();
}
