import { uuidv7 } from '@css/shared';
import { type PublicApplicationCreate, validate } from '@css/shared/forms';
import { isoDateInDhaka } from '@css/shared/format';
import type { AuditWriter } from '../audit/audit-writer';
import type { Clock } from '../core/clock';
import { isUniqueViolation } from '../core/db-errors';
import type { PrismaService, Tx } from '../core/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import type { BeneficiaryIdentityService } from './beneficiary-identity';
import { type FormVersionView, readDefinition, versionView } from './forms';
import { isAddressChain } from './locations';
import type { NisabService } from './nisab';
import { linkOf } from './public-link-rules';
import type { Replayable } from './uploads';

/** What the public page shows: the project's name and closing date, and the form. */
export interface PublicFormView {
  project: { name: { bn: string; en: string }; applyTo: string | null };
  form: FormVersionView;
}

export interface PublicSubmission {
  id: string;
  status: string;
  stage: string | null;
}

/**
 * The flags a public entry carries for the official who verifies it, from the list the
 * `applications_flags_check` constraint allows (DATABASE_SCHEMA: the needs-verification reasons).
 */
export const PUBLIC_FLAGS = {
  publicEntry: 'public_entry',
  existingIdentity: 'existing_identity',
  identityBlocked: 'identity_blocked',
  identityRepeated: 'identity_repeated',
} as const;

/** The status a public entry waits in until an official verifies it. */
export const NEEDS_VERIFICATION = 'needs_verification';

const DAY_MS = 24 * 60 * 60 * 1000;

type AddressChain = [string, string, string, string];

/** The four address ids the engine split out of the answers, when all four are there. */
function addressOf(standard: Record<string, unknown>): AddressChain | null {
  const ids = [
    standard.division_id,
    standard.district_id,
    standard.upazila_id,
    standard.union_id,
  ].map((id) => (typeof id === 'string' ? id : null));
  return ids.every((id): id is string => id !== null) ? (ids as AddressChain) : null;
}

interface ResolvedLink {
  projectId: string;
  name: { bn: string; en: string };
  applyTo: string | null;
  version: {
    id: string;
    formId: string;
    versionNo: number;
    status: string;
    publishedAt: Date | null;
  };
}

/**
 * The public application form (docs/plans/2026-10-21-1135-feat-form-engine-plan.md, "The public
 * link"): anyone with the link reads the published volunteer-visible form of an
 * active project inside its application window and submits an application that waits for
 * verification without a profile. The applicant learns nothing about existing profiles or blocks;
 * the official who verifies sees them as flags on the row. Every closed state of a link answers
 * the same not-found.
 */
export class PublicFormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly clock: Clock,
    private readonly nisab: NisabService,
    private readonly identity: BeneficiaryIdentityService,
  ) {}

  async form(token: string): Promise<PublicFormView> {
    const link = await this.resolve(token);
    return {
      project: { name: link.name, applyTo: link.applyTo },
      form: versionView(
        link.version,
        await readDefinition(this.prisma, link.version.id, 'volunteer'),
      ),
    };
  }

  async submit(
    token: string,
    body: PublicApplicationCreate,
  ): Promise<Replayable<PublicSubmission>> {
    const link = await this.resolve(token);
    const earlier = await this.earlier(link.projectId, body.clientUuid);
    if (earlier) return { replay: true, value: earlier };
    const today = isoDateInDhaka(this.clock.now());
    const definition = await readDefinition(this.prisma, link.version.id, 'volunteer');
    const checked = validate(definition, body.answers, {
      audience: 'public',
      today,
      ...(await this.nisabValue(today)),
    });
    if (!checked.ok) throw new ApiError('validation.failed', 422, undefined, checked.errors);
    const chain = addressOf(checked.standard);
    if (!chain || !(await isAddressChain(this.prisma, chain)))
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'address', code: 'validation.address_incomplete' },
      ]);
    const [divisionId, districtId, , unionId] = chain;
    const flags = [
      PUBLIC_FLAGS.publicEntry,
      ...(await this.identityFlags(link.projectId, checked.standard)),
    ];
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const fields = new Map(
          (
            await tx.formField.findMany({
              where: { formVersionId: link.version.id },
              select: { id: true, fieldKey: true },
            })
          ).map((f) => [f.fieldKey, f.id]),
        );
        const applicationId = uuidv7();
        await tx.application.create({
          data: {
            id: applicationId,
            projectId: link.projectId,
            formVersionId: link.version.id,
            regionLocationId: divisionId,
            districtId,
            unionId,
            status: NEEDS_VERIFICATION,
            flags,
            clientUuid: body.clientUuid,
            clientCreatedAt: body.clientCreatedAt ? new Date(body.clientCreatedAt) : null,
            submittedAt: this.clock.now(),
          },
        });
        await tx.applicationAnswer.createMany({
          data: checked.answers.flatMap((a) => {
            const fieldId = fields.get(a.fieldKey);
            return fieldId
              ? [
                  {
                    id: uuidv7(),
                    applicationId,
                    fieldId,
                    repeatIndex: a.repeatIndex ?? 0,
                    value: a.value as Prisma.InputJsonValue,
                  },
                ]
              : [];
          }),
        });
        await this.audit.record(tx, {
          action: 'application.public_submitted',
          entityType: 'application',
          entityId: applicationId,
          clientUuid: body.clientUuid,
        });
        return applicationId;
      });
      return { replay: false, value: { id, status: NEEDS_VERIFICATION, stage: null } };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // the same client id arrived twice at the same moment: the first one is the answer; a
      // client id already used on another project is the client's mistake, not a replay
      const winner = await this.earlier(link.projectId, body.clientUuid);
      if (winner) return { replay: true, value: winner };
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'clientUuid', code: 'validation.failed' },
      ]);
    }
  }

  /** A link that takes applications now, or 404 for every closed state alike. */
  private async resolve(token: string): Promise<ResolvedLink> {
    const closed = () => new ApiError('public.link_closed', 404);
    const component = await this.prisma.projectComponent.findFirst({
      where: {
        componentKey: 'public_link',
        enabled: true,
        settings: { path: ['token'], equals: token },
      },
      select: {
        projectId: true,
        settings: true,
        project: {
          select: { status: true, applyFrom: true, applyTo: true, nameBn: true, nameEn: true },
        },
      },
    });
    if (!component) throw closed();
    // the row was found by its token; what remains is whether the link is open
    const link = linkOf(component.settings);
    if (!link.enabled || !link.formId) throw closed();
    const { project } = component;
    if (project.status !== 'active') throw closed();
    const today = isoDateInDhaka(this.clock.now());
    const applyFrom = project.applyFrom ? isoDateInDhaka(project.applyFrom) : null;
    const applyTo = project.applyTo ? isoDateInDhaka(project.applyTo) : null;
    if ((applyFrom && today < applyFrom) || (applyTo && applyTo < today)) throw closed();
    const published = await this.prisma.formVersion.findFirst({
      where: { formId: link.formId, status: 'published', form: { projectId: component.projectId } },
      select: { id: true, formId: true, versionNo: true, status: true, publishedAt: true },
    });
    if (!published) throw closed();
    return {
      projectId: component.projectId,
      name: { bn: project.nameBn, en: project.nameEn },
      applyTo,
      version: published,
    };
  }

  /** The record an earlier submission with this client id made on this project, if any. */
  private async earlier(projectId: string, clientUuid: string): Promise<PublicSubmission | null> {
    const row = await this.prisma.application.findUnique({
      where: { clientUuid },
      select: { id: true, status: true, stage: true, projectId: true },
    });
    return row && row.projectId === projectId
      ? { id: row.id, status: row.status, stage: row.stage }
      : null;
  }

  private async nisabValue(today: string): Promise<{ nisabValue?: string }> {
    try {
      return { nisabValue: (await this.nisab.inForceOn(today)).value };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return {};
      throw error;
    }
  }

  /**
   * What the verifying official will want to know, never told to the applicant: whether a live
   * profile holds the number, whether that profile is blocked, and whether the same number or
   * mobile came through this link in the last day.
   */
  private async identityFlags(
    projectId: string,
    standard: Record<string, unknown>,
  ): Promise<string[]> {
    const columns = new Map(Object.entries(standard));
    const text = (name: string) => {
      const value = columns.get(name);
      return typeof value === 'string' && value !== '' ? value : null;
    };
    const flags: string[] = [];
    const nid = text('nid');
    const birthReg = text('birth_reg');
    const mobile = text('mobile');
    const identities = [nid, birthReg].filter((v): v is string => v !== null);
    if (identities.length) {
      const holder = await this.prisma.beneficiary.findFirst({
        where: { OR: [...(nid ? [{ nid }] : []), ...(birthReg ? [{ birthReg }] : [])] },
        select: { id: true },
      });
      const live = holder ? await this.identity.liveOf(this.prisma, holder.id) : null;
      if (live) {
        flags.push(PUBLIC_FLAGS.existingIdentity);
        const profile = await this.prisma.beneficiary.findUnique({
          where: { id: live },
          select: { isBlocked: true },
        });
        if (profile?.isBlocked) flags.push(PUBLIC_FLAGS.identityBlocked);
      }
    }
    const terms = [...identities, ...(mobile ? [mobile] : [])];
    if (terms.length && (await this.repeatedToday(this.prisma, projectId, terms)))
      flags.push(PUBLIC_FLAGS.identityRepeated);
    return flags;
  }

  /** Whether a public entry of the last day on this project carries one of these values. */
  private async repeatedToday(db: Tx, projectId: string, terms: string[]): Promise<boolean> {
    const since = new Date(this.clock.now().getTime() - DAY_MS);
    const rows = await db.$queryRaw<{ one: number }[]>`
      SELECT 1 AS one
      FROM application_answers a
      JOIN applications ap ON ap.id = a.application_id
      JOIN form_fields f ON f.id = a.field_id
      WHERE ap.project_id = ${projectId}::uuid
        AND ${PUBLIC_FLAGS.publicEntry} = ANY(ap.flags)
        AND ap.created_at >= ${since}
        AND f.field_key IN ('nid_or_birth_reg', 'mobile')
        AND a.value->>'v' IN (${Prisma.join(terms)})
      LIMIT 1`;
    return rows.length > 0;
  }
}
