import { z } from 'zod';
import { toEnglishDigits } from '../digits.js';
import { bilingualText } from '../i18n/bilingual.js';
import { SUPPORTED_LOCALES } from '../i18n/locales.js';
import { isAmount, toPaisa } from '../projects/budget.js';

/**
 * The system settings kept in the `settings` table (DATABASE_SCHEMA 7, MASTER_SPEC A21): one
 * schema and one default per key. The API validates every write against the key's schema and
 * answers the default while no row exists; the PWA builds its forms on the same schemas.
 */

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1, { message: 'validation.required' })
    .max(max, { message: 'validation.too_long' });
const bilingual = (max: number) =>
  bilingualText.refine((v) => v.bn.length <= max && v.en.length <= max, {
    message: 'validation.too_long',
  });
const mobile = z
  .string()
  .transform((v) => toEnglishDigits(v.trim()))
  .pipe(z.string().regex(/^01[3-9][0-9]{8}$/, { message: 'validation.mobile_format' }));
const email = z
  .email({ message: 'validation.email_format' })
  .max(254)
  .transform((v) => v.toLowerCase());
const intInRange = (min: number, max: number) =>
  z
    .number({ message: 'validation.out_of_range' })
    .int({ message: 'validation.out_of_range' })
    .min(min, { message: 'validation.out_of_range' })
    .max(max, { message: 'validation.out_of_range' });
const days = intInRange(1, 365);

/** The Foundation's and the department's names, address and contact (heads reports and emails). */
export const organisationSettingSchema = z.strictObject({
  foundationName: bilingual(200),
  departmentName: bilingual(200),
  address: bilingual(500),
  phone: mobile,
  email,
});
export type OrganisationSetting = z.infer<typeof organisationSettingSchema>;

/** The language of a visitor without a choice and of a new account; the Hijri date beside long dates. */
export const localizationSettingSchema = z.strictObject({
  defaultLanguage: z.enum(SUPPORTED_LOCALES),
  hijriDates: z.boolean(),
});
export type LocalizationSetting = z.infer<typeof localizationSettingSchema>;

/** When the monitoring work raises an alert; read by the monitoring control centre later. */
export const monitoringThresholdsSchema = z.strictObject({
  reviewPendingDays: days,
  approvalPendingDays: days,
  noUpdateDays: days,
  inactiveVolunteerDays: days,
  budgetAlertPercent: intInRange(1, 100),
});
export type MonitoringThresholds = z.infer<typeof monitoringThresholdsSchema>;

/** Host names the server must never be pointed at: local names and internal domains. */
const INTERNAL_NAME = /^(localhost|.+\.localhost|.+\.local|.+\.internal|.+\.home\.arpa)$/;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Whether an IPv4 address is not on the public internet (this network, private, loopback, shared, link-local). */
function isInternalIpv4(a: number, b: number): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/**
 * Whether a text is an https URL on a public host: a stored provider endpoint is called by the
 * server, so local names, internal domains, private, loopback, shared and link-local addresses and
 * IPv6 literals are refused. A host name that resolves to a private address is caught only where
 * the adapter connects; the real provider's adapter checks its host there.
 */
export function isPublicHttpsUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return false;
  // a fully qualified name may end in dots ("localhost."); the name is the same without them
  const host = url.hostname.toLowerCase().replace(/\.+$/, '');
  if (host === '' || host.startsWith('[') || INTERNAL_NAME.test(host)) return false;
  const ip = IPV4.exec(host);
  return !ip || !isInternalIpv4(Number(ip[1]), Number(ip[2]));
}

/**
 * The provider-agnostic SMS adapter configuration, kept until a provider is chosen. The provider's
 * key never lives here; it stays in the server's environment.
 */
export const smsProviderSettingSchema = z.strictObject({
  provider: z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,39}$/, { message: 'validation.list_code' })
    .nullable(),
  senderId: text(20).nullable(),
  enabled: z.boolean(),
  endpoint: z
    .string()
    .trim()
    .max(500, { message: 'validation.too_long' })
    .refine(isPublicHttpsUrl, { message: 'validation.https_public_url' })
    .nullable(),
});
export type SmsProviderSetting = z.infer<typeof smsProviderSettingSchema>;

export const SETTING_SCHEMAS = {
  organisation: organisationSettingSchema,
  localization: localizationSettingSchema,
  'monitoring.thresholds': monitoringThresholdsSchema,
  'sms.provider': smsProviderSettingSchema,
} as const;
export type SettingKey = keyof typeof SETTING_SCHEMAS;
export const SETTING_KEYS = Object.keys(SETTING_SCHEMAS) as SettingKey[];
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;

/** The keys read and written through the settings page; the SMS key has its own channels page. */
export const GENERAL_SETTING_KEYS = [
  'organisation',
  'localization',
  'monitoring.thresholds',
] as const;
export type GeneralSettingKey = (typeof GENERAL_SETTING_KEYS)[number];

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTING_SCHEMAS, key);
}

/**
 * The values in force until someone changes them (the decided alert thresholds; the department's names). The
 * names are bilingual data the admin edits, not interface text; the contact is a placeholder the
 * admin replaces on the settings page.
 */
export const SETTING_DEFAULTS: { [K in SettingKey]: SettingValue<K> } = {
  organisation: {
    foundationName: { bn: 'আস-সুন্নাহ ফাউন্ডেশন', en: 'As-Sunnah Foundation' }, // i18n-allow-bengali: bilingual data
    departmentName: {
      bn: 'চ্যারিটি এন্ড সোশ্যাল সার্ভিস ডিপার্টমেন্ট', // i18n-allow-bengali: bilingual data
      en: 'Charity & Social Service Department',
    },
    address: { bn: 'ঢাকা, বাংলাদেশ', en: 'Dhaka, Bangladesh' }, // i18n-allow-bengali: bilingual data
    phone: '01700000000',
    email: 'contact@example.org',
  },
  localization: { defaultLanguage: 'bn', hijriDates: false },
  'monitoring.thresholds': {
    reviewPendingDays: 7,
    approvalPendingDays: 5,
    noUpdateDays: 7,
    inactiveVolunteerDays: 14,
    budgetAlertPercent: 90,
  },
  'sms.provider': { provider: null, senderId: null, enabled: false, endpoint: null },
};

/** A setting change: the whole value of the key, validated by the key's schema. */
export const settingUpdateSchema = z.strictObject({ value: z.unknown() });

// ---- Reference lists kept on the settings page ---------------------------------------------------

/** The lists the settings page keeps; the other reference lists are fixed by decisions. */
export const EDITABLE_LISTS = ['expense_category_default', 'issue_type_default'] as const;
export type EditableList = (typeof EDITABLE_LISTS)[number];

export function isEditableList(key: string): key is EditableList {
  return (EDITABLE_LISTS as readonly string[]).includes(key);
}

/** A new item's code: small English letters, digits and _, starting with a letter; never changed. */
export const listCodeSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{1,63}$/, { message: 'validation.list_code' });

const sortOrder = intInRange(0, 10_000).optional();

export const referenceItemCreateSchema = z.strictObject({
  code: listCodeSchema,
  label: bilingual(200),
  active: z.boolean().optional(),
  sortOrder,
});
export type ReferenceItemCreate = z.infer<typeof referenceItemCreateSchema>;

export const referenceItemUpdateSchema = z
  .strictObject({
    label: bilingual(200).optional(),
    active: z.boolean().optional(),
    sortOrder,
  })
  .refine((v) => v.label !== undefined || v.active !== undefined || v.sortOrder !== undefined, {
    message: 'validation.required',
  });
export type ReferenceItemUpdate = z.infer<typeof referenceItemUpdateSchema>;

// ---- Nisab --------------------------------------------------------------------------------------

/** The largest nisab accepted, in Taka: a mistyped amount must not become a version. */
export const NISAB_MAX_TAKA = 10_000_000;
/** How far ahead a new version may take effect, in days; the service checks it against today. */
export const NISAB_MAX_DAYS_AHEAD = 366;

/** A calendar date written YYYY-MM-DD that exists (no 31 February). */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'validation.date_format' })
  .refine(
    (v) => {
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
    },
    { message: 'validation.date_format' },
  );

export const nisabAddSchema = z.strictObject({
  value: z
    .string()
    .trim()
    .refine(isAmount, { message: 'validation.amount_format' })
    .refine(
      (v) => !isAmount(v) || (toPaisa(v) > 0n && toPaisa(v) <= BigInt(NISAB_MAX_TAKA) * 100n),
      {
        message: 'validation.out_of_range',
      },
    ),
  effectiveFrom: isoDate,
  basisNote: z.string().trim().max(500, { message: 'validation.too_long' }).optional(),
});
export type NisabAdd = z.infer<typeof nisabAddSchema>;

export const nisabWithdrawSchema = z.strictObject({ reason: text(500) });
export type NisabWithdraw = z.infer<typeof nisabWithdrawSchema>;

export interface NisabVersionView {
  id: string;
  value: string;
  effectiveFrom: string;
  basisNote: string | null;
  setBy: { id: string; name: string };
  createdAt: string;
  /** In force today: the latest version that took effect and was not withdrawn. */
  inForce: boolean;
  withdrawn: { at: string; by: { id: string; name: string }; reason: string } | null;
}
