import { SourceFileService, type LocalSource } from '../../bindings/example.com/pdf-desktop';

export type SourceKind = 'pdf-image' | 'photo' | 'watermark';

/** Opens the native file picker so every source retains its Windows path. */
export async function chooseSources(kind: SourceKind, multiple: boolean): Promise<LocalSource[]> {
  return (await SourceFileService.ChooseFiles(kind, multiple)) ?? [];
}

/** Reads one selected file into a browser File for existing local processors. */
export async function readSource(kind: SourceKind, index: number, source: LocalSource): Promise<File> {
  const chunks: BlobPart[] = [];
  const chunkSize = 2 * 1024 * 1024;
  for (let offset = 0; offset < source.bytes; offset += chunkSize) {
    const binary = atob(await SourceFileService.ReadFileChunk(kind, index, offset));
    if (binary.length !== Math.min(chunkSize, source.bytes - offset)) throw new Error('源文件读取不完整，请重新选择');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    chunks.push(bytes.buffer as ArrayBuffer);
  }
  const extension = source.name.split('.').pop()?.toLowerCase();
  const mime = kind === 'pdf-image' ? 'application/pdf' : extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
  return new File(chunks, source.name, { type: mime });
}
