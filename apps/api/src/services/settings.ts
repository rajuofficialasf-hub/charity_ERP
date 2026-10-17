import {
  GENERAL_SETTING_KEYS,
  type GeneralSettingKey,
  type OrganisationSetting,
  SETTING_DEFAULTS,
  SETTING_SCHEMAS,
  type SettingKey,
  type SettingValue,
} from '@css/shared/settings';
import { z } from 'zod';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { PrismaService, Tx } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { parseWith } from '../http/validate';
import { ApiError } from '../i18n/api-error';

export interface SettingView {
  key: string;
  value: unknown;
  /** When the value was last changed; null while the default is in force. */
  updatedAt: string | null;
}

export interface PublicSettings {
  defaultLanguage: SettingValue<'localization'>['defaultLanguage'];
  organisation: OrganisationSetting;
}

const isGeneral = (key: string): key is GeneralSettingKey =>
  (GENERAL_SETTING_KEYS as readonly string[]).includes(key);

/**
 * The system settings (docs/MASTER_SPEC.md, A21; docs/DECISION_LOG.md, the admin and settings
 * decision of 2026-10-17): typed keys with their defaults in `@css/shared/settings`. The settings
 * page reads and writes the organisation, the language defaults and the alert thresholds; the SMS
 * adapter configuration is written only through the channels page. Every change is audited with
 * the old and the new value. The table also holds the seed markers, which are never read here.
 */
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  /** The value in force: the stored one when it is valid, otherwise the default. */
  async get<K extends SettingKey>(key: K, db: Tx = this.prisma): Promise<SettingValue<K>> {
    return (await this.read(db, key)).value;
  }

  /** The keys of the settings page with their values. */
  async list(): Promise<SettingView[]> {
    const views: SettingView[] = [];
    for (const key of GENERAL_SETTING_KEYS) views.push(await this.view(this.prisma, key));
    return views;
  }

  /** What every visitor may read: the default language and the organisation's public details. */
  async publicView(): Promise<PublicSettings> {
    const [localization, organisation] = await Promise.all([
      this.get('localization'),
      this.get('organisation'),
    ]);
    return { defaultLanguage: localization.defaultLanguage, organisation };
  }

  /** A change from the settings page; any other key is unknown there (404). */
  async update(actor: Principal, key: string, value: unknown): Promise<SettingView> {
    if (!isGeneral(key)) throw new ApiError('permission.not_found', 404);
    return this.write(actor, key, value);
  }

  /**
   * Replaces the whole value of a key after validating it with the key's schema (422 names the
   * field under `value`), in one transaction with its audit entry.
   */
  async write(actor: Principal, key: SettingKey, value: unknown): Promise<SettingView> {
    // eslint-disable-next-line security/detect-object-injection -- key is a SettingKey
    const schema = z.strictObject({ value: SETTING_SCHEMAS[key] });
    const parsed = parseWith(schema, 'body', { value }).value as Prisma.InputJsonValue;
    return this.prisma.$transaction(async (tx) => {
      // one writer at a time per key, so the audit's old value is the one replaced
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('settings:' || ${key}))`;
      const before = await this.read(tx, key);
      const row = await tx.setting.upsert({
        where: { key },
        create: { key, value: parsed, updatedBy: actor.userId },
        update: { value: parsed, updatedBy: actor.userId, updatedAt: new Date() },
        select: { updatedAt: true },
      });
      await this.audit.record(tx, {
        action: 'settings.change',
        entityType: 'setting',
        old: { key, value: before.value as Prisma.InputJsonValue },
        new: { key, value: parsed },
      });
      return { key, value: parsed, updatedAt: row.updatedAt.toISOString() };
    });
  }

  private async view(db: Tx, key: SettingKey): Promise<SettingView> {
    const { value, updatedAt } = await this.read(db, key);
    return { key, value, updatedAt: updatedAt?.toISOString() ?? null };
  }

  private async read<K extends SettingKey>(
    db: Tx,
    key: K,
  ): Promise<{ value: SettingValue<K>; updatedAt: Date | null }> {
    const row = await db.setting.findUnique({
      where: { key },
      select: { value: true, updatedAt: true },
    });
    // eslint-disable-next-line security/detect-object-injection -- key is a SettingKey
    const parsed = row ? SETTING_SCHEMAS[key].safeParse(row.value) : null;
    if (parsed?.success)
      return { value: parsed.data as SettingValue<K>, updatedAt: row!.updatedAt };
    // eslint-disable-next-line security/detect-object-injection -- key is a SettingKey
    return { value: SETTING_DEFAULTS[key], updatedAt: null };
  }
}
