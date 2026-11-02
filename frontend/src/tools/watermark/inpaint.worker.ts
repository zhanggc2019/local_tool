import { inpaint } from './inpaint';

/** Processes the masked image away from the UI thread. */
self.onmessage = (event: MessageEvent<{ image: ImageData; mask: Uint8Array; radius: number }>) => {
  try {
    const result = inpaint(event.data.image, event.data.mask, event.data.radius);
    self.postMessage({ result }, { transfer: [result.data.buffer] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : '修复失败' });
  }
};
