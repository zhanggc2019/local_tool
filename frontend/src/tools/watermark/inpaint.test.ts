import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inpaint } from './inpaint';

const prior = globalThis.ImageData;

/** Supplies the browser's ImageData constructor to the algorithm test runtime. */
beforeAll(() => {
  globalThis.ImageData = class ImageDataStub {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) { this.data = data; this.width = width; this.height = height; }
  } as typeof ImageData;
});

/** Restores the global ImageData constructor after the test. */
afterAll(() => { globalThis.ImageData = prior; });

describe('local image repair', () => {
  it('fills a marked logo patch from the surrounding solid background', () => {
    const width = 32; const height = 32;
    const data = new Uint8ClampedArray(width * height * 4);
    const mask = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const logo = x >= 12 && x < 20 && y >= 12 && y < 20;
      data.set(logo ? [230, 20, 20, 255] : [40, 100, 180, 255], index * 4);
      if (logo) mask[index] = 1;
    }
    const image = new ImageData(data, width, height);
    const result = inpaint(image, mask);
    expect(Array.from(result.data.slice((16 * width + 16) * 4, (16 * width + 16) * 4 + 4))).toEqual([40, 100, 180, 255]);
    expect(Array.from(image.data.slice((16 * width + 16) * 4, (16 * width + 16) * 4 + 4))).toEqual([230, 20, 20, 255]);
  });
});
