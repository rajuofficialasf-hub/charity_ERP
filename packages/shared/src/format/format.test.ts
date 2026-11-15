import { describe, expect, it } from 'vitest';
import {
  isoDateInDhaka,
  formatCount,
  formatDate,
  formatDateLong,
  formatDateTime,
  formatDecimal,
  formatDuration,
  formatFileSize,
  formatGps,
  formatIdNumber,
  formatMobile,
  formatPercent,
  formatRelative,
  formatTaka,
  formatTime,
  formatWeekday,
} from './index.js';

// 10 October 2026, 16:40 in Dhaka (UTC+6) = 10:40 UTC (the examples of docs/ui/I18N.md, "Formats")
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 10, h - 6, m));
const sample = at(16, 40);
const BENGALI_DIGIT = /[০-৯]/u;

describe('formatter', () => {
  it('formats counts, decimals and percentages with lakh grouping in both languages', () => {
    for (const locale of ['bn', 'en'] as const) {
      expect(formatCount(1234567, locale)).toBe('12,34,567');
      expect(formatDecimal(28.8, 2, locale)).toBe('28.8');
      expect(formatPercent(0.62, locale)).toBe('62%');
    }
    expect(formatCount(25_000_000)).toBe('2,50,00,000'); // counts never in millions
  });

  it('shows exact Taka and the boundaries of the short summary amounts', () => {
    expect(formatTaka(1_260_000)).toBe('৳ 12,60,000');
    expect(formatTaka(1250.5)).toBe('৳ 1,250.50');
    expect(formatTaka(-5000)).toBe('−৳ 5,000');
    expect(formatTaka(999_999, 'bn', { summary: true })).toBe('৳ 9,99,999');
    expect(formatTaka(300_000, 'en', { summary: true })).toBe('৳ 3,00,000');
    expect(formatTaka(1_000_000, 'bn', { summary: true })).toBe('৳ 1 মিলিয়ন');
    expect(formatTaka(1_260_000, 'bn', { summary: true })).toBe('৳ 1.26 মিলিয়ন');
    expect(formatTaka(1_260_000, 'en', { summary: true })).toBe('৳ 1.26 million');
    expect(formatTaka(12_500_000, 'en', { summary: true })).toBe('৳ 12.5 million');
  });

  it('formats dates as dd-mm-yyyy in Dhaka time, long dates and weekdays', () => {
    expect(formatDate(sample)).toBe('10-10-2026');
    expect(formatDate('2026-12-01')).toBe('01-12-2026');
    expect(formatDate(new Date(Date.UTC(2026, 9, 10, 19, 30)))).toBe('11-10-2026'); // 01:30 next day in Dhaka
    expect(formatDateLong(sample, 'bn')).toBe('10 অক্টোবর 2026');
    expect(formatDateLong(sample, 'en')).toBe('10 October 2026');
    expect(formatWeekday(sample, 'bn')).toBe('শনিবার');
    expect(formatWeekday(sample, 'en')).toBe('Saturday');
  });

  it('writes 12-hour time with the Bengali day period first', () => {
    expect(formatTime(sample, 'bn')).toBe('বিকাল 4:40');
    expect(formatTime(sample, 'en')).toBe('4:40 PM');
    expect(formatDateTime(sample, 'bn')).toBe('10-10-2026 বিকাল 4:40');
    expect(formatDateTime(sample, 'en')).toBe('10-10-2026 4:40 PM');
  });

  it.each([
    [0, 0, 'রাত 12:00', '12:00 AM'],
    [3, 59, 'রাত 3:59', '3:59 AM'],
    [4, 0, 'ভোর 4:00', '4:00 AM'],
    [5, 59, 'ভোর 5:59', '5:59 AM'],
    [6, 0, 'সকাল 6:00', '6:00 AM'],
    [11, 59, 'সকাল 11:59', '11:59 AM'],
    [12, 0, 'দুপুর 12:00', '12:00 PM'],
    [15, 59, 'দুপুর 3:59', '3:59 PM'],
    [16, 0, 'বিকাল 4:00', '4:00 PM'],
    [17, 59, 'বিকাল 5:59', '5:59 PM'],
    [18, 0, 'সন্ধ্যা 6:00', '6:00 PM'],
    [19, 59, 'সন্ধ্যা 7:59', '7:59 PM'],
    [20, 0, 'রাত 8:00', '8:00 PM'],
    [23, 59, 'রাত 11:59', '11:59 PM'],
  ])('day period boundary %i:%i', (h, m, bn, en) => {
    expect(formatTime(at(h, m), 'bn')).toBe(bn);
    expect(formatTime(at(h, m), 'en')).toBe(en);
  });

  it('formats relative times, durations, file sizes and GPS', () => {
    const now = at(16, 40);
    expect(formatRelative(at(14, 40), 'bn', now)).toBe('2 ঘণ্টা আগে');
    expect(formatRelative(at(14, 40), 'en', now)).toBe('2 hours ago');
    expect(formatRelative(new Date(now.getTime() - 86_400_000), 'bn', now)).toBe('গতকাল');
    expect(formatRelative(new Date(now.getTime() - 86_400_000), 'en', now)).toBe('yesterday');
    expect(formatDuration(6, 'day', 'bn')).toBe('6 দিন');
    expect(formatDuration(6, 'day', 'en')).toBe('6 days');
    expect(formatDuration(1, 'day', 'en')).toBe('1 day');
    expect(formatFileSize(412 * 1024)).toBe('412 KB');
    expect(formatFileSize(1.2 * 1024 * 1024)).toBe('1.2 MB');
    expect(formatGps(23.84561, 90.25672, 8.2)).toBe('23.8456, 90.2567 · ±8 m');
  });

  it('never prints Bengali digits', () => {
    const outputs = [
      formatCount(9876543210, 'bn'),
      formatTaka(1_234_567.89, 'bn'),
      formatTaka(55_000_000, 'bn', { summary: true }),
      formatDateLong(sample, 'bn'),
      formatDateTime(sample, 'bn'),
      formatRelative(at(10), 'bn', sample),
      formatDuration(12, 'hour', 'bn'),
      formatFileSize(5_000_000, 'bn'),
    ];
    for (const text of outputs) expect(text).not.toMatch(BENGALI_DIGIT);
  });
});

describe('isoDateInDhaka', () => {
  it('gives the Dhaka calendar date, six hours ahead of UTC', () => {
    expect(isoDateInDhaka(new Date('2026-10-17T17:59:00Z'))).toBe('2026-10-17');
    expect(isoDateInDhaka(new Date('2026-10-17T18:00:00Z'))).toBe('2026-10-18');
  });

  it('groups an identity number by four and splits a mobile after its operator part, for display only', () => {
    expect(formatIdNumber('23654789654123654')).toBe('2365 4789 6541 2365 4');
    expect(formatIdNumber('1000001053')).toBe('1000 0010 53');
    expect(formatIdNumber('BEN-0000500')).toBe('BEN-0000500');
    expect(formatMobile('01365478965')).toBe('01365-478965');
    expect(formatMobile('+8801365478965')).toBe('+8801365478965');
  });
});
