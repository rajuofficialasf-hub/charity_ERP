/** Bangladesh keeps UTC+6 the whole year, with no summer time. */
const DHAKA_OFFSET_MS = 6 * 3_600_000;
const DAY_MS = 86_400_000;

/**
 * The moment the day of `at` began in Dhaka (midnight there), as a UTC instant: the start of the
 * daily limits and the daily figures, which count by the department's own day.
 */
export function dhakaDayStart(at: Date): Date {
  const local = at.getTime() + DHAKA_OFFSET_MS;
  return new Date(local - (local % DAY_MS) - DHAKA_OFFSET_MS);
}

/** The year of `at` in Dhaka, which numbers the year's figures and sessions. */
export function dhakaYear(at: Date): number {
  return new Date(at.getTime() + DHAKA_OFFSET_MS).getUTCFullYear();
}
