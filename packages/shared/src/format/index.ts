/* eslint-disable security/detect-object-injection -- keys are typed unions, or checked with Object.hasOwn before use */
/**
 * Entry `@css/shared/format`: the one formatter of numbers, money, dates and times (I18N.md 6).
 * English digits in both languages, Taka shown as the owner decided (exact in entry and lists,
 * short in summaries), 12-hour time with the
 * Bengali day periods first, Asia/Dhaka display time, no Hijri date. Words come from the
 * `common` catalogue only, so the web bundle does not carry the other namespaces.
 */
import bnCommon from '../i18n/messages/bn/common.json' with { type: 'json' };
import enCommon from '../i18n/messages/en/common.json' with { type: 'json' };
import type { Locale } from '../i18n/locales.js';

/** The digit system (I18N 6.1). Bengali digits would need an owner decision and this constant. */
export const DIGITS = 'latn';
export const TIME_ZONE = 'Asia/Dhaka';

/** Intl locale tags with Latin digits (I18N 6.1). */
export const INTL_LOCALE: Record<Locale, string> = {
  bn: `bn-BD-u-nu-${DIGITS}`,
  en: `en-IN-u-nu-${DIGITS}`,
};

const WORDS = { bn: bnCommon, en: enCommon };
const MINUS = '−';
/** The taka sign, written before amounts with one space (I18N 6.2). */
export const TAKA_SIGN = '৳';
const TAKA = TAKA_SIGN;

const numberFormats = new Map<string, Intl.NumberFormat>();
function nf(locale: Locale, options: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  const id = `${locale}${JSON.stringify(options)}`;
  let f = numberFormats.get(id);
  if (!f) {
    f = new Intl.NumberFormat(INTL_LOCALE[locale], options);
    numberFormats.set(id, f);
  }
  return f;
}

/** Counts and integers with lakh grouping; never in millions: 12,34,567. */
export function formatCount(value: number, locale: Locale = 'bn'): string {
  return nf(locale, { maximumFractionDigits: 0 }).format(value);
}

/** Averages and quantities, at most `max` decimals: 28.8. */
export function formatDecimal(value: number, max = 2, locale: Locale = 'bn'): string {
  return nf(locale, { maximumFractionDigits: max }).format(value);
}

/** A ratio as a percentage: 0.62 → 62%. */
export function formatPercent(ratio: number, locale: Locale = 'bn', maxDecimals = 0): string {
  return `${nf(locale, { maximumFractionDigits: maxDecimals }).format(ratio * 100)}%`;
}

/**
 * Taka with the sign before the amount and one space (I18N 6.2). Exact amounts (entry fields,
 * ledgers, vouchers, exports) keep up to 2 decimals; `summary` amounts from 10 lakh are shown in
 * millions with at most 2 decimals and trailing zeros dropped. Negative amounts: −৳ 5,000.
 */
export function formatTaka(
  value: number,
  locale: Locale = 'bn',
  options: { summary?: boolean } = {},
): string {
  const sign = value < 0 ? MINUS : '';
  const amount = Math.abs(value);
  if (options.summary && amount >= 1_000_000) {
    const millions = nf(locale, { maximumFractionDigits: 2 }).format(
      Math.round((amount / 1_000_000) * 100) / 100,
    );
    return `${sign}${TAKA} ${millions} ${WORDS[locale].unit.million}`;
  }
  const decimals = Number.isInteger(amount) ? 0 : 2;
  return `${sign}${TAKA} ${nf(locale, { minimumFractionDigits: decimals, maximumFractionDigits: 2 }).format(amount)}`;
}

/** Date-time parts in Dhaka time. A plain `YYYY-MM-DD` business date is taken as is. */
function parts(input: Date | string): {
  y: number;
  m: number;
  d: number;
  h: number;
  min: number;
  date: Date;
} {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split('-').map(Number) as [number, number, number];
    return { y, m, d, h: 0, min: 0, date: new Date(Date.UTC(y, m - 1, d, 6)) };
  }
  const date = typeof input === 'string' ? new Date(input) : input;
  const p = new Intl.DateTimeFormat('en-GB-u-nu-latn', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(p.find((x) => x.type === type)?.value);
  return {
    y: get('year'),
    m: get('month'),
    d: get('day'),
    h: get('hour'),
    min: get('minute'),
    date,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The calendar date in Dhaka as YYYY-MM-DD: what "today" means for dates the department sets. */
export function isoDateInDhaka(input: Date | string): string {
  const { y, m, d } = parts(input);
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Every date in screens, lists and exports: dd-mm-yyyy. */
export function formatDate(input: Date | string): string {
  const { y, m, d } = parts(input);
  return `${pad(d)}-${pad(m)}-${y}`;
}

/** Headings of letters and PDF reports: 10 অক্টোবর 2026 / 10 October 2026. */
export function formatDateLong(input: Date | string, locale: Locale = 'bn'): string {
  const { d, date } = parts(input);
  const f = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: TIME_ZONE,
    month: 'long',
    year: 'numeric',
  });
  const month = f.formatToParts(date).find((x) => x.type === 'month')?.value ?? '';
  const year = parts(input).y;
  return `${d} ${month} ${year}`;
}

/** Weekday name: শনিবার / Saturday. */
export function formatWeekday(input: Date | string, locale: Locale = 'bn'): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: TIME_ZONE,
    weekday: 'long',
  }).format(parts(input).date);
}

/** Bengali day periods of the 24-hour clock (I18N 6.3). */
function dayPeriod(hour: number): keyof (typeof bnCommon)['day_period'] {
  if (hour < 4) return 'night_early';
  if (hour < 6) return 'dawn';
  if (hour < 12) return 'morning';
  if (hour < 16) return 'noon';
  if (hour < 18) return 'afternoon';
  if (hour < 20) return 'evening';
  return 'night_late';
}

/** Time of day in 12-hour form: বিকাল 4:40 / 4:40 PM. */
export function formatTime(input: Date | string, locale: Locale = 'bn'): string {
  const { h, min } = parts(input);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const words = WORDS[locale];
  return words.time.pattern
    .replace('{period}', words.day_period[dayPeriod(h)])
    .replace('{time}', `${hour12}:${pad(min)}`);
}

/** Timelines, logs, photo stamps: 10-10-2026 বিকাল 4:40 / 10-10-2026 4:40 PM. */
export function formatDateTime(input: Date | string, locale: Locale = 'bn'): string {
  return `${formatDate(input)} ${formatTime(input, locale)}`;
}

/** Recent events: 2 ঘণ্টা আগে, গতকাল / 2 hours ago, yesterday. Absolute time goes on focus. */
export function formatRelative(
  input: Date | string,
  locale: Locale = 'bn',
  now: Date = new Date(),
): string {
  const seconds = Math.round((parts(input).date.getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 30 * 86_400) return rtf.format(Math.round(seconds / 86_400), 'day');
  return formatDate(input);
}

/** Waiting times and countdowns: 6 দিন / 6 days. */
export function formatDuration(
  value: number,
  unit: 'day' | 'hour' | 'minute' = 'day',
  locale: Locale = 'bn',
): string {
  return nf(locale, { style: 'unit', unit, unitDisplay: 'long', maximumFractionDigits: 0 }).format(
    value,
  );
}

/** File and storage sizes, 1 KB = 1,024 bytes: 412 KB, 1.2 MB. */
export function formatFileSize(bytes: number, locale: Locale = 'bn'): string {
  if (bytes < 1024) return `${formatCount(bytes, locale)} B`;
  if (bytes < 1024 ** 2) return `${formatCount(Math.round(bytes / 1024), locale)} KB`;
  if (bytes < 1024 ** 3) return `${formatDecimal(bytes / 1024 ** 2, 1, locale)} MB`;
  return `${formatDecimal(bytes / 1024 ** 3, 1, locale)} GB`;
}

/** Photo stamps and site verification: 23.8456, 90.2567 · ±8 m. */
export function formatGps(lat: number, lng: number, accuracyMeters?: number): string {
  const position = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  return accuracyMeters === undefined ? position : `${position} · ±${Math.round(accuracyMeters)} m`;
}
