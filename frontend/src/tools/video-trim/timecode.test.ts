import { describe, expect, it } from 'vitest';
import { formatTimecode, parseTimecode } from './timecode';

describe('timecode parsing', () => {
  it('accepts plain seconds, decimals, and h:mm:ss', () => {
    expect(parseTimecode('90')).toBe(90_000);
    expect(parseTimecode('1.5')).toBe(1500);
    expect(parseTimecode(' 1:30 ')).toBe(90_000);
    expect(parseTimecode('1:02:03')).toBe(3_723_000);
    expect(parseTimecode('0')).toBe(0);
    expect(parseTimecode('0:00.250')).toBe(250);
  });

  it('rejects malformed input', () => {
    expect(parseTimecode('')).toBeNull();
    expect(parseTimecode('abc')).toBeNull();
    expect(parseTimecode('1:2:3:4')).toBeNull();
    expect(parseTimecode('-30')).toBeNull();
    expect(parseTimecode('1:60')).toBeNull();
    expect(parseTimecode('90:00')).toBeNull(); // minutes must stay below 60
    expect(parseTimecode('1:1.2345')).toBeNull(); // at most three decimals
    expect(parseTimecode('999999999999999999')).toBeNull(); // outside safe integers
  });
});

describe('timecode formatting', () => {
  it('renders m:ss and h:mm:ss like the Go helper', () => {
    expect(formatTimecode(0)).toBe('0:00');
    expect(formatTimecode(90_000)).toBe('1:30');
    expect(formatTimecode(3_723_000)).toBe('1:02:03');
    expect(formatTimecode(1_400)).toBe('0:01'); // rounds to the nearest second
  });

  it('handles invalid input defensively', () => {
    expect(formatTimecode(-5)).toBe('0:00');
    expect(formatTimecode(Number.NaN)).toBe('0:00');
  });

  it('round-trips values produced by the parser', () => {
    for (const text of ['45', '2:30', '1:02:03']) {
      const ms = parseTimecode(text)!;
      expect(parseTimecode(formatTimecode(ms))).toBe(Math.round(ms / 1000) * 1000);
    }
  });
});
