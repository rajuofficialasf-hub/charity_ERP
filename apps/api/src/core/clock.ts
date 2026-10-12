/**
 * The current time behind one interface, so tests can move the clock for expiry rules (lockout,
 * token and session lifetimes, OTP validity) without waiting.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
