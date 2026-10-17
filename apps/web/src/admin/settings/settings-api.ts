import type { Bilingual } from '@css/shared/i18n';
import type {
  EditableList,
  GeneralSettingKey,
  LocalizationSetting,
  MonitoringThresholds,
  OrganisationSetting,
  ReferenceItemCreate,
  ReferenceItemUpdate,
  SmsProviderSetting,
} from '@css/shared/settings';
import { api } from '../../lib/api';

/** One key of GET /settings; `updatedAt` is null while the default is in force. */
export interface SettingEntry<T = unknown> {
  key: GeneralSettingKey;
  value: T;
  updatedAt: string | null;
}

export interface GeneralSettings {
  organisation: SettingEntry<OrganisationSetting>;
  localization: SettingEntry<LocalizationSetting>;
  'monitoring.thresholds': SettingEntry<MonitoringThresholds>;
}

export interface ReferenceItem {
  code: string;
  label: Bilingual;
  active: boolean;
  sortOrder: number;
}

export interface Channels {
  smtp: { host: string; port: number; secure: boolean; from: string; loginSet: boolean };
  sms: {
    mode: 'logging' | 'dry_run';
    keyPresent: boolean;
    config: SmsProviderSetting;
    updatedAt: string | null;
  };
  otpDummy: boolean;
}

export const SETTINGS_KEY = ['admin', 'settings'] as const;
export const listKey = (list: EditableList) => ['admin', 'reference-list', list] as const;
export const CHANNELS_KEY = ['admin', 'channels'] as const;

/** GET /settings, by key. */
export async function settings(): Promise<GeneralSettings> {
  const rows = await api<SettingEntry[]>('/settings');
  return Object.fromEntries(rows.map((r) => [r.key, r])) as unknown as GeneralSettings;
}

/** PATCH /settings/{key} with the whole value; field errors come back as `value.<field>`. */
export const updateSetting = <K extends GeneralSettingKey>(
  key: K,
  value: GeneralSettings[K]['value'],
) => api<SettingEntry>(`/settings/${key}`, { method: 'PATCH', body: { value } });

export const referenceItems = (list: EditableList) =>
  api<ReferenceItem[]>(`/reference-lists/${list}`);

export const addItem = (list: EditableList, body: ReferenceItemCreate) =>
  api<ReferenceItem>(`/reference-lists/${list}`, { method: 'POST', body });

export const updateItem = (list: EditableList, code: string, body: ReferenceItemUpdate) =>
  api<ReferenceItem>(`/reference-lists/${list}/items/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    body,
  });

export const channels = () => api<Channels>('/admin/channels');

export const setSms = (body: SmsProviderSetting) =>
  api<Channels>('/admin/channels/sms', { method: 'PUT', body });
