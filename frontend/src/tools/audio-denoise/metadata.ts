export interface AudioStats {
  format: string;
  sampleRate: number | null;
  duration: number;
  channels: number;
  bytes: number;
}

/** Reads an unsigned 32-bit little-endian integer from byte content. */
function uint32LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536 + bytes[offset + 3] * 16777216;
}

/** Finds the source rate in a RIFF/WAVE fmt chunk. */
export function wavSampleRate(bytes: Uint8Array): number | null {
  if (bytes.length < 44 || bytes[0] !== 82 || bytes[1] !== 73 || bytes[2] !== 70 || bytes[3] !== 70 || bytes[8] !== 87 || bytes[9] !== 65 || bytes[10] !== 86 || bytes[11] !== 69) return null;
  for (let offset = 12; offset + 24 <= bytes.length;) {
    const size = uint32LE(bytes, offset + 4);
    if (bytes[offset] === 102 && bytes[offset + 1] === 109 && bytes[offset + 2] === 116 && bytes[offset + 3] === 32) {
      const rate = uint32LE(bytes, offset + 12);
      return rate >= 8000 && rate <= 192000 ? rate : null;
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

/** Locates the first plausible MPEG audio frame and returns its encoded sample rate. */
export function mp3SampleRate(bytes: Uint8Array): number | null {
  const mpeg1Bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const mpeg2Bitrates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  for (let offset = 0; offset + 4 < bytes.length; offset++) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) continue;
    const version = (bytes[offset + 1] >> 3) & 3;
    const layer = (bytes[offset + 1] >> 1) & 3;
    const bitrateIndex = bytes[offset + 2] >> 4;
    const rateIndex = (bytes[offset + 2] >> 2) & 3;
    if (version === 1 || layer !== 1 || bitrateIndex < 1 || bitrateIndex > 14 || rateIndex === 3) continue;
    const rate = [44100, 48000, 32000][rateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    const bitrate = (version === 3 ? mpeg1Bitrates : mpeg2Bitrates)[bitrateIndex];
    const frameSize = Math.floor((version === 3 ? 144000 : 72000) * bitrate / rate + ((bytes[offset + 2] >> 1) & 1));
    const next = offset + frameSize;
    if (next + 2 < bytes.length && !(bytes[next] === 0xff && (bytes[next + 1] & 0xe0) === 0xe0)) continue;
    return rate;
  }
  return null;
}

/** Reads the 16.16 sample-rate field from an MP4 mp4a sample entry. */
export function m4aSampleRate(bytes: Uint8Array): number | null {
  for (let offset = 4; offset + 32 <= bytes.length; offset++) {
    if (bytes[offset] !== 0x6d || bytes[offset + 1] !== 0x70 || bytes[offset + 2] !== 0x34 || bytes[offset + 3] !== 0x61) continue;
    const atomSize = (bytes[offset - 4] * 16777216 + bytes[offset - 3] * 65536 + bytes[offset - 2] * 256 + bytes[offset - 1]);
    if (atomSize < 36) continue;
    const rate = (bytes[offset + 28] * 256 + bytes[offset + 29]);
    if (rate >= 8000 && rate <= 65535) return rate;
  }
  return null;
}

/** Reads the original encoded sample rate without Web Audio's implicit resampling. */
export async function sourceSampleRate(file: Blob, name: string): Promise<number | null> {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'wav') return wavSampleRate(new Uint8Array(await file.slice(0, 4096).arrayBuffer()));
  if (extension === 'mp3') {
    const first = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    let start = 0;
    if (first.length === 10 && first[0] === 73 && first[1] === 68 && first[2] === 51) {
      start = 10 + ((first[6] & 0x7f) << 21) + ((first[7] & 0x7f) << 14) + ((first[8] & 0x7f) << 7) + (first[9] & 0x7f);
      if (first[5] & 0x10) start += 10;
    }
    return mp3SampleRate(new Uint8Array(await file.slice(start, start + 128 * 1024).arrayBuffer()));
  }
  if (extension === 'm4a') {
    const start = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer());
    const rate = m4aSampleRate(start);
    if (rate) return rate;
    return m4aSampleRate(new Uint8Array(await file.slice(Math.max(0, file.size - 1024 * 1024)).arrayBuffer()));
  }
  return null;
}
