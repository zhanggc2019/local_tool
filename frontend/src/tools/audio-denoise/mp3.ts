import { Mp3Encoder } from '@breezystack/lamejs';

interface PCMInfo {
  channels: number;
  sampleRate: number;
  dataStart: number;
  dataBytes: number;
}

/** Parses the 16-bit PCM WAV produced by the bundled denoising runner. */
function parsePCM16(wav: ArrayBuffer): PCMInfo {
  const view = new DataView(wav);
  if (view.byteLength < 44 || view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645) throw new Error('无法识别降噪 WAV');
  let channels = 0;
  let sampleRate = 0;
  let pcm = 0;
  let bitDepth = 0;
  let dataStart = 0;
  let dataBytes = 0;
  for (let offset = 12; offset + 8 <= view.byteLength;) {
    const tag = view.getUint32(offset, false);
    const size = view.getUint32(offset + 4, true);
    if (tag === 0x666d7420 && size >= 16 && offset + 24 <= view.byteLength) {
      pcm = view.getUint16(offset + 8, true);
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitDepth = view.getUint16(offset + 22, true);
    }
    if (tag === 0x64617461) { dataStart = offset + 8; dataBytes = Math.min(size, view.byteLength - dataStart); break; }
    offset += 8 + size + (size % 2);
  }
  if (pcm !== 1 || (channels !== 1 && channels !== 2) || !sampleRate || bitDepth !== 16 || dataBytes < channels * 2) throw new Error('MP3 编码仅支持 16 位单/双声道 WAV');
  return { channels, sampleRate, dataStart, dataBytes };
}

/** Encodes a PCM16 WAV into 192 kbps MP3 entirely in the local worker. */
export function encodeWavMP3(wav: ArrayBuffer, progress?: (percent: number) => void): Uint8Array {
  const info = parsePCM16(wav);
  const view = new DataView(wav);
  const encoder = new Mp3Encoder(info.channels, info.sampleRate, 192);
  const totalFrames = Math.floor(info.dataBytes / (info.channels * 2));
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (let start = 0; start < totalFrames; start += 1152) {
    const count = Math.min(1152, totalFrames - start);
    const left = new Int16Array(count);
    const right = info.channels === 2 ? new Int16Array(count) : undefined;
    for (let frame = 0; frame < count; frame++) {
      const offset = info.dataStart + (start + frame) * info.channels * 2;
      left[frame] = view.getInt16(offset, true);
      if (right) right[frame] = view.getInt16(offset + 2, true);
    }
    const encoded = encoder.encodeBuffer(left, right);
    if (encoded.length) { const copy = encoded.slice(); chunks.push(copy); length += copy.length; }
    if (progress && start % (1152 * 64) === 0) progress(Math.round(100 * (start + count) / totalFrames));
  }
  const tail = encoder.flush();
  if (tail.length) { chunks.push(tail.slice()); length += tail.length; }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  progress?.(100);
  return result;
}
