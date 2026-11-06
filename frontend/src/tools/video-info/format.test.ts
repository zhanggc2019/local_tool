import { describe, expect, it } from 'vitest';
import { describeChannels, formatDurationMs, formatFPS, formatKbps, formatResolution } from './format';

describe('video info formatting', () => {
  it('formats durations', () => {
    expect(formatDurationMs(0)).toBe('0:00');
    expect(formatDurationMs(90_000)).toBe('1:30');
    expect(formatDurationMs(3_723_000)).toBe('1:02:03');
    expect(formatDurationMs(-5)).toBe('—');
    expect(formatDurationMs(Number.NaN)).toBe('—');
  });

  it('formats bitrates', () => {
    expect(formatKbps(126)).toBe('126 kbps');
    expect(formatKbps(2134)).toBe('2.13 Mbps');
    expect(formatKbps(0)).toBe('—');
  });

  it('translates channel layouts', () => {
    expect(describeChannels('mono')).toBe('单声道');
    expect(describeChannels('stereo')).toBe('立体声');
    expect(describeChannels('5.1 channels')).toBe('5.1 声道');
    expect(describeChannels('')).toBe('—');
  });

  it('formats frame rates and resolutions', () => {
    expect(formatFPS(24)).toBe('24 fps');
    expect(formatFPS(29.97)).toBe('29.97 fps');
    expect(formatFPS(0)).toBe('—');
    expect(formatResolution(640, 360)).toBe('640 × 360');
    expect(formatResolution(0, 360)).toBe('—');
  });
});
