/** Selectable playback rates mirrored from the Go service. */
export const SPEED_RATES = [0.5, 0.75, 1.25, 1.5, 2, 3, 4] as const;

/** Formats a rate like 2x or 0.75x. */
export function rateLabel(rate: number): string {
  return `${Number.isInteger(rate) ? rate : rate.toFixed(2).replace(/0$/, '')}×`;
}

/** Checks one rate coming from the interface. */
export function isSpeedRate(value: number): boolean {
  return SPEED_RATES.includes(value as (typeof SPEED_RATES)[number]);
}
