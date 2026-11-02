/** Normalizes a web address for encoding in a QR code. */
export function normalizeWebURL(raw: string): string {
  const value = raw.trim();
  if (!value) throw new Error('请输入网址');
  if (value.length > 1200) throw new Error('网址过长，请缩短后重试');
  if (/\s/.test(value)) throw new Error('网址不能包含空格');
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) throw new Error('只支持 HTTP 或 HTTPS 网址');
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let url: URL;
  try { url = new URL(candidate); }
  catch { throw new Error('网址格式不正确'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('只支持普通 HTTP 或 HTTPS 网址');
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') throw new Error('请输入完整网址，例如 example.com');
  return url.href;
}
