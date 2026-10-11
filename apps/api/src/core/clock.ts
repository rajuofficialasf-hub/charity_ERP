/**
 * The current time as one injectable, so tests can move the clock for expiry rules (lockout,
 * token and session lifetimes, OTP validity) without waiting.
 */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = { now: () => new Date() };
