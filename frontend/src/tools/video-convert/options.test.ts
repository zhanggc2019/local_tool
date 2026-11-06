import { describe, expect, it } from 'vitest';
import { VIDEO_TARGETS, isVideoTarget } from './options';

describe('video conversion targets', () => {
  it('offers the three containers in the Go order', () => {
    expect(VIDEO_TARGETS.map((target) => target.value)).toEqual(['mp4', 'mkv', 'webm']);
    for (const target of VIDEO_TARGETS) expect(target.hint.length).toBeGreaterThan(0);
  });

  it('validates container identifiers', () => {
    expect(isVideoTarget('mp4')).toBe(true);
    expect(isVideoTarget('mkv')).toBe(true);
    expect(isVideoTarget('webm')).toBe(true);
    expect(isVideoTarget('avi')).toBe(false);
    expect(isVideoTarget('')).toBe(false);
  });
});
