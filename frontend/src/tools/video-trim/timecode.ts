/** Parses "ss", "mm:ss", or "h:mm:ss" into milliseconds; null when invalid. */
export function parseTimecode(text: string): number | null {
  const value = text.trim();
  if (!value) return null;
  const parts = value.split(':');
  if (parts.length > 3) return null;
  const numbers: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,6}(?:\.\d{1,3})?$/.test(part)) return null;
    numbers.push(Number(part));
  }
  if (numbers.some((number) => !Number.isFinite(number) || number < 0)) return null;
  // Seconds and minutes must stay below 60; hours (three-part form) are unbounded.
  if (numbers.length >= 2) {
    if (numbers[numbers.length - 1] >= 60) return null;
    if (numbers[numbers.length - 2] >= 60) return null;
  }
  let seconds = 0;
  for (const number of numbers) seconds = seconds * 60 + number;
  const ms = Math.round(seconds * 1000);
  if (!Number.isSafeInteger(ms) || ms < 0) return null;
  return ms;
}

/** Renders milliseconds as h:mm:ss or m:ss, mirroring the Go helper. */
export function formatTimecode(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
