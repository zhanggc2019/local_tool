import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { sourceSampleRate } from './metadata';

/** Reads a generated tone fixture through the same Blob interface as the app. */
async function tone(extension: string): Promise<Blob> {
  const file = await readFile(new URL(`./testdata/tone.${extension}`, import.meta.url));
  return new Blob([file]);
}

describe('audio source metadata', () => {
  it.each(['wav', 'mp3', 'm4a'])('reads the encoded 44.1 kHz rate from %s', async (extension) => {
    expect(await sourceSampleRate(await tone(extension), `tone.${extension}`)).toBe(44100);
  });
});
