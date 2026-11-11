/* eslint-disable security/detect-object-injection -- keys are typed locales and fields, or catalogue keys checked with Object.hasOwn */
import {
  type EditableChannel,
  NOTIFICATION_TEMPLATES,
  PERSON_VARIABLES,
  TEMPLATE_SAMPLES,
  type TemplateEdit,
  type TemplateTextInput,
  templateVariables,
  uuidv7,
} from '@css/shared';
import { type Locale, renderTemplateText } from '@css/shared/i18n';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Principal } from '../auth/principal.js';
import type { PrismaService } from '../core/prisma.service.js';
import { ApiError, type ApiErrorDetail } from '../i18n/api-error.js';
import { NOTIFICATION_CATALOGUE, type NotificationCategory } from '../notifications/catalogue.js';

const LOCALES: readonly Locale[] = ['bn', 'en'];

interface StoredText {
  subject: string | null;
  title: string | null;
  body: string;
}

export interface TemplateChannelView {
  version: number;
  bn: StoredText;
  en: StoredText;
}

export interface TemplateView {
  key: string;
  category: NotificationCategory;
  variables: string[];
  channels: Partial<Record<EditableChannel, TemplateChannelView>>;
}

/**
 * The notification templates of the catalogue for the Department Head and the Monitoring Team
 * (docs/architecture/NOTIFICATIONS.md, templates): the active text of each channel in both
 * languages, a preview with sample values, and an edit that inserts a new version and audits it,
 * so entries and emails already written keep the version they were made with. The direct OTP and
 * set-password texts stay in code and are not listed.
 */
export class NotificationTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  async list(): Promise<TemplateView[]> {
    const keys = Object.keys(NOTIFICATION_CATALOGUE);
    const rows = await this.prisma.notificationTemplate.findMany({
      where: { key: { in: keys }, active: true, channel: { in: ['in_app', 'email'] } },
      select: {
        key: true,
        channel: true,
        locale: true,
        subject: true,
        title: true,
        body: true,
        version: true,
      },
    });
    return keys.map((key) => {
      const entry = NOTIFICATION_CATALOGUE[key]!;
      const channels: TemplateView['channels'] = {};
      for (const channel of this.channelsOf(key)) {
        const of = (locale: Locale) =>
          rows.find((r) => r.key === key && r.channel === channel && r.locale === locale);
        const bn = of('bn');
        const en = of('en');
        if (!bn || !en) continue;
        channels[channel] = {
          version: Math.max(bn.version, en.version),
          bn: { subject: bn.subject, title: bn.title, body: bn.body },
          en: { subject: en.subject, title: en.title, body: en.body },
        };
      }
      return { key, category: entry.category, variables: this.declared(key), channels };
    });
  }

  /** Both languages rendered with sample values, without saving. */
  preview(key: string, channel: string, body: TemplateEdit) {
    const editable = this.editable(key, channel);
    this.check(key, editable, body);
    const samples = Object.fromEntries(
      this.declared(key).map((v) => [
        v,
        Object.hasOwn(TEMPLATE_SAMPLES, v) ? TEMPLATE_SAMPLES[v]! : v,
      ]),
    );
    const render = (locale: Locale) =>
      renderTemplateText(key, body[locale], this.declared(key), locale, samples);
    return { bn: render('bn'), en: render('en') };
  }

  /** A new version of one channel in both languages; the old one stays for what it rendered. */
  async edit(actor: Principal, key: string, channel: string, body: TemplateEdit) {
    const editable = this.editable(key, channel);
    this.check(key, editable, body);
    await this.prisma.$transaction(async (tx) => {
      // one edit of a template at a time: the versions never collide
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`template:${key}:${editable}`}, 0))`;
      const current = await tx.notificationTemplate.findMany({
        where: { key, channel: editable, active: true },
        select: { id: true, locale: true, subject: true, title: true, body: true, version: true },
      });
      const latest = await tx.notificationTemplate.aggregate({
        where: { key, channel: editable },
        _max: { version: true },
      });
      const version = (latest._max.version ?? 0) + 1;
      await tx.notificationTemplate.updateMany({
        where: { key, channel: editable, active: true },
        data: { active: false, updatedBy: actor.userId },
      });
      for (const locale of LOCALES)
        await tx.notificationTemplate.create({
          data: {
            id: uuidv7(),
            key,
            channel: editable,
            locale,
            subject: editable === 'email' ? (body[locale].subject ?? null) : null,
            title: editable === 'in_app' ? (body[locale].title ?? null) : null,
            body: body[locale].body,
            variables: this.declared(key),
            version,
            active: true,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
        });
      await this.audit.record(tx, {
        action: 'notification.template.change',
        entityType: 'notification_template',
        entityId: null,
        old: { key, channel: editable, texts: this.texts(current) },
        new: { key, channel: editable, version, texts: body },
      });
    });
    return (await this.list()).find((t) => t.key === key)!;
  }

  private channelsOf(key: string): EditableChannel[] {
    const entry = NOTIFICATION_CATALOGUE[key]!;
    return [
      ...(entry.inApp ? (['in_app'] as const) : []),
      ...(entry.email ? (['email'] as const) : []),
    ];
  }

  /** The key's channel when the catalogue sends it; anything else is not found. */
  private editable(key: string, channel: string): EditableChannel {
    if (!Object.hasOwn(NOTIFICATION_CATALOGUE, key))
      throw new ApiError('permission.not_found', 404);
    const found = this.channelsOf(key).find((c) => c === channel);
    if (!found) throw new ApiError('permission.not_found', 404);
    return found;
  }

  private declared(key: string): string[] {
    return NOTIFICATION_TEMPLATES.find((t) => t.key === key)?.variables ?? [];
  }

  /**
   * The rules of a text: an email has a subject and no title, an in-app entry a title and no
   * subject; a placeholder must be declared for the key; an in-app text never names a person.
   */
  private check(key: string, channel: EditableChannel, body: TemplateEdit): void {
    const declared = this.declared(key);
    const details: ApiErrorDetail[] = [];
    for (const locale of LOCALES) {
      const text: TemplateTextInput = body[locale];
      const heading = channel === 'email' ? 'subject' : 'title';
      const other = channel === 'email' ? 'title' : 'subject';
      if (!text[heading])
        details.push({ path: `${locale}.${heading}`, code: 'validation.required' });
      if (text[other] !== undefined)
        details.push({ path: `${locale}.${other}`, code: 'validation.unknown_parameter' });
      for (const field of ['subject', 'title', 'body'] as const) {
        const value = text[field];
        if (!value) continue;
        for (const name of templateVariables(value)) {
          if (!declared.includes(name))
            details.push({ path: `${locale}.${field}`, code: 'notification.placeholder_unknown' });
          else if (channel === 'in_app' && PERSON_VARIABLES.includes(name))
            details.push({ path: `${locale}.${field}`, code: 'notification.person_in_app' });
        }
      }
    }
    if (details.length) throw new ApiError('validation.failed', 422, undefined, details);
  }

  private texts(rows: ({ locale: string } & StoredText)[]) {
    return Object.fromEntries(
      rows.map((r) => [r.locale, { subject: r.subject, title: r.title, body: r.body }]),
    );
  }
}
