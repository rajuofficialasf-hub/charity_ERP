import { z } from 'zod';

/**
 * The period of a session, one year's work of a project (docs/DECISION_LOG.md, "Programs and
 * projects in one tab, with permanent projects and yearly sessions"): a start month and an end
 * month. The label that stands beside the project's name is read from the period and never stored.
 */

/** The most months a session covers, its first and its last month counted. */
export const MAX_SESSION_MONTHS = 24;

/** The years a session may start in (the `year` column of a project holds the start year). */
export const SESSION_YEAR_MIN = 2020;
export const SESSION_YEAR_MAX = 2100;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A calendar month, yyyy-mm. */
export const sessionMonth = z.string().regex(MONTH, { message: 'validation.date_format' });

/** The months since year 0 of a month or a date that starts with yyyy-mm. */
const monthIndex = (value: string) =>
  Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;

/**
 * The months a period covers, its first and its last month counted: 12 for January to December,
 * zero or less when the end lies before the start. Takes months (yyyy-mm) or dates (yyyy-mm-dd).
 */
export function sessionMonths(periodFrom: string, periodTo: string): number {
  return monthIndex(periodTo) - monthIndex(periodFrom) + 1;
}

/**
 * The label of a session: its start year alone when it ends in that year ("2026"), else the start
 * year with the last two digits of the end year ("2026-27"), or with the whole end year when the
 * century turns between them ("2099-2100"), since "2099-00" would read as an earlier year. Takes
 * months (yyyy-mm) or dates (yyyy-mm-dd), so the stored dates and a form's months give the same
 * label.
 */
export function sessionLabel(periodFrom: string, periodTo: string): string {
  const from = periodFrom.slice(0, 4);
  const to = periodTo.slice(0, 4);
  if (from === to) return from;
  return from.slice(0, 2) === to.slice(0, 2) ? `${from}-${to.slice(2)}` : `${from}-${to}`;
}

/** The year a session starts in, which numbers its applications. */
export function sessionYear(periodFrom: string): number {
  return Number(periodFrom.slice(0, 4));
}

/**
 * The days a period of months runs between, as stored: the first day of the start month and the
 * last day of the end month.
 */
export function sessionDates(period: { periodFrom: string; periodTo: string }): {
  from: string;
  to: string;
} {
  const year = Number(period.periodTo.slice(0, 4));
  const month = Number(period.periodTo.slice(5, 7));
  // day 0 of the next month is the last day of this one
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${period.periodFrom}-01`,
    to: `${period.periodTo}-${String(last).padStart(2, '0')}`,
  };
}

/**
 * The period a request carries. Refused: an end before its start, more than
 * `MAX_SESSION_MONTHS` months, and a start year outside the years a project may hold.
 */
export const sessionPeriod = z
  .strictObject({ periodFrom: sessionMonth, periodTo: sessionMonth })
  .superRefine((period, ctx) => {
    // a month that is not a month has its own issue; nothing to compare then
    if (!MONTH.test(period.periodFrom) || !MONTH.test(period.periodTo)) return;
    const year = sessionYear(period.periodFrom);
    if (year < SESSION_YEAR_MIN || year > SESSION_YEAR_MAX)
      ctx.addIssue({ code: 'custom', path: ['periodFrom'], message: 'validation.out_of_range' });
    const months = sessionMonths(period.periodFrom, period.periodTo);
    if (months < 1 || months > MAX_SESSION_MONTHS)
      ctx.addIssue({ code: 'custom', path: ['periodTo'], message: 'validation.out_of_range' });
  });
export type SessionPeriod = z.infer<typeof sessionPeriod>;
