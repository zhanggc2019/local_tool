import { encodeWavMP3 } from './mp3';

/** Encodes WAV in a worker to keep the desktop interface responsive. */
self.onmessage = (event: MessageEvent<{ wav: ArrayBuffer }>) => {
  try {
    const result = encodeWavMP3(event.data.wav, (percent) => self.postMessage({ kind: 'progress', percent }));
    self.postMessage({ kind: 'done', bytes: result.buffer }, { transfer: [result.buffer] });
  } catch (error) {
    self.postMessage({ kind: 'error', message: error instanceof Error ? error.message : 'MP3 编码失败' });
  }
};
