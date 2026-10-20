import { describe, expect, it } from 'vitest';
import {
  isPublicHttpsUrl,
  isSettingKey,
  listCodeSchema,
  monitoringThresholdsSchema,
  nisabAddSchema,
  nisabWithdrawSchema,
  organisationSettingSchema,
  referenceItemUpdateSchema,
  SETTING_DEFAULTS,
  SETTING_KEYS,
  SETTING_SCHEMAS,
  smsProviderSettingSchema,
  localizationSettingSchema,
} from './index.js';

const codes = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((i) => i.message) ?? [];

describe('settings', () => {
  it('accepts every default with its own schema', () => {
    for (const key of SETTING_KEYS) {
      expect(SETTING_SCHEMAS[key].safeParse(SETTING_DEFAULTS[key]).success, key).toBe(true);
    }
  });

  it('starts the thresholds at the decided defaults', () => {
    expect(SETTING_DEFAULTS['monitoring.thresholds']).toEqual({
      reviewPendingDays: 7,
      approvalPendingDays: 5,
      noUpdateDays: 7,
      inactiveVolunteerDays: 14,
      budgetAlertPercent: 90,
    });
  });

  it('knows its keys and nothing else', () => {
    expect(isSettingKey('organisation')).toBe(true);
    expect(isSettingKey('toString')).toBe(false);
    expect(isSettingKey('alerts.other')).toBe(false);
  });

  it('keeps thresholds between 1 and 365 days and the budget between 1 and 100 percent', () => {
    const base = SETTING_DEFAULTS['monitoring.thresholds'];
    expect(monitoringThresholdsSchema.safeParse({ ...base, reviewPendingDays: 0 }).success).toBe(
      false,
    );
    expect(monitoringThresholdsSchema.safeParse({ ...base, noUpdateDays: 366 }).success).toBe(
      false,
    );
    expect(
      monitoringThresholdsSchema.safeParse({ ...base, approvalPendingDays: 2.5 }).success,
    ).toBe(false);
    expect(monitoringThresholdsSchema.safeParse({ ...base, budgetAlertPercent: 101 }).success).toBe(
      false,
    );
    expect(codes(monitoringThresholdsSchema.safeParse({ ...base, budgetAlertPercent: 0 }))).toEqual(
      ['validation.out_of_range'],
    );
    expect(monitoringThresholdsSchema.safeParse({ ...base, reviewPendingDays: 365 }).success).toBe(
      true,
    );
  });

  it('checks the organisation phone and email and reads Bengali digits', () => {
    const base = SETTING_DEFAULTS.organisation;
    expect(codes(organisationSettingSchema.safeParse({ ...base, phone: '0123' }))).toEqual([
      'validation.mobile_format',
    ]);
    expect(codes(organisationSettingSchema.safeParse({ ...base, email: 'not an email' }))).toEqual([
      'validation.email_format',
    ]);
    const parsed = organisationSettingSchema.parse({ ...base, phone: '০১৭১১০০০০০০' });
    expect(parsed.phone).toBe('01711000000');
    expect(
      organisationSettingSchema.safeParse({ ...base, address: { bn: '', en: 'x' } }).success,
    ).toBe(false);
  });

  it('allows only bn or en as the default language', () => {
    expect(localizationSettingSchema.safeParse({ defaultLanguage: 'ar' }).success).toBe(false);
  });

  it('accepts only an https endpoint on a public host for SMS', () => {
    expect(isPublicHttpsUrl('https://api.sms-provider.com.bd/send')).toBe(true);
    for (const bad of [
      'http://api.example.com/send',
      'https://localhost/send',
      'https://127.0.0.1/send',
      'https://10.0.0.5/send',
      'https://192.168.1.1/send',
      'https://172.20.0.1/send',
      'https://169.254.169.254/latest',
      'https://[::1]/send',
      'https://localhost./send',
      'https://metadata.google.internal./latest',
      'https://printer.local/x',
      'https://100.64.0.1/send',
      'https://0.1.2.3/send',
      'https://user:pass@api.example.com/send',
      'https://api.example.com/send?api_key=abc',
      'https://api.example.com/send#key',
      'not a url',
    ]) {
      expect(isPublicHttpsUrl(bad), bad).toBe(false);
    }
    const base = SETTING_DEFAULTS['sms.provider'];
    expect(
      codes(smsProviderSettingSchema.safeParse({ ...base, endpoint: 'https://10.1.1.1/x' })),
    ).toEqual(['validation.https_public_url']);
  });

  it('switches SMS on only with a provider named', () => {
    const base = SETTING_DEFAULTS['sms.provider'];
    expect(codes(smsProviderSettingSchema.safeParse({ ...base, enabled: true }))).toEqual([
      'validation.required',
    ]);
    expect(
      smsProviderSettingSchema.safeParse({ ...base, enabled: true, provider: 'gateway' }).success,
    ).toBe(true);
  });

  it('takes list codes in small letters, digits and _ only', () => {
    expect(listCodeSchema.safeParse('banner_print').success).toBe(true);
    expect(listCodeSchema.safeParse('Banner').success).toBe(false);
    expect(listCodeSchema.safeParse('1banner').success).toBe(false);
    expect(referenceItemUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('takes a nisab amount above zero and up to the limit, with a date', () => {
    expect(
      nisabAddSchema.safeParse({ value: '98500.00', effectiveFrom: '2027-01-01' }).success,
    ).toBe(true);
    expect(codes(nisabAddSchema.safeParse({ value: '0', effectiveFrom: '2027-01-01' }))).toEqual([
      'validation.out_of_range',
    ]);
    expect(
      codes(nisabAddSchema.safeParse({ value: '10000000.01', effectiveFrom: '2027-01-01' })),
    ).toEqual(['validation.out_of_range']);
    expect(
      codes(nisabAddSchema.safeParse({ value: '12,000', effectiveFrom: '2027-01-01' })),
    ).toEqual(['validation.amount_format']);
    expect(nisabAddSchema.safeParse({ value: '1000', effectiveFrom: '1/1/2027' }).success).toBe(
      false,
    );
    expect(codes(nisabAddSchema.safeParse({ value: '1000', effectiveFrom: '2031-02-31' }))).toEqual(
      ['validation.date_format'],
    );
    expect(nisabAddSchema.safeParse({ value: '1000', effectiveFrom: '2031-13-01' }).success).toBe(
      false,
    );
    expect(nisabAddSchema.safeParse({ value: '1000', effectiveFrom: '2032-02-29' }).success).toBe(
      true,
    );
    expect(nisabWithdrawSchema.safeParse({ reason: '  ' }).success).toBe(false);
  });
});
