import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { mp3SampleRate } from './metadata';
import { encodeWavMP3 } from './mp3';

describe('local MP3 export', () => {
  it.each([['tone.wav', 44100], ['tone-stereo-48k.wav', 48000]])('encodes %s at its sample rate', async (name, rate) => {
    const input = await readFile(new URL(`./testdata/${name}`, import.meta.url));
    const wav = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer;
    const output = encodeWavMP3(wav);
    expect(output.length).toBeGreaterThan(1000);
    expect(mp3SampleRate(output)).toBe(rate);
  });
});
