import { uuidv7 } from '@css/shared';
import { optionalIdentityOf, type PublicApplicationCreate, validate } from '@css/shared/forms';
import { isoDateInDhaka } from '@css/shared/format';
import type { IdentityRules } from '@css/shared/projects';
import {
  addressOf,
  identityOf,
  nisabOption,
  photoAnswers,
  typedName,
} from '../applications/answers.js';
import { BLOCKED_NAME_MATCH } from '../applications/view.js';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Clock } from '../core/clock.js';
import { isUniqueViolation } from '../core/db-errors.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../i18n/api-error.js';
import { type BeneficiaryIdentityService, personKeysOf } from './beneficiary-identity.js';
import { type FormVersionView, versionView } from './forms.js';
import { isAddressChain } from './locations.js';
import type { NisabService } from './nisab.js';
import { publishedDefinition } from './published-definitions.js';
import { resolveOpenLink } from './public-link-rules.js';
import type { PublicPhotosService } from './public-photos.js';
import type { Replayable } from './uploads.js';

/**
 * What the public page shows: the project's name and closing date, whether its application must
 * carry an identity document, and the form.
 */
export interface PublicFormView {
  project: {
    name: { bn: string; en: string };
    applyTo: string | null;
    identityDocument: IdentityRules['document'];
  };
  form: FormVersionView;
}

export interface PublicSubmission {
  id: string;
  status: string;
  stage: string | null;
}

/**
 * The flags a public entry carries for the official who verifies it, from the list the
 * `applications_flags_check` constraint allows (the needs-verification reasons of
 * docs/database/DATABASE_SCHEMA.md, "applications").
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
    private readonly photos: PublicPhotosService,
  ) {}

  async form(token: string): Promise<PublicFormView> {
    const link = await resolveOpenLink(this.prisma, this.clock.now(), token);
    return {
      project: {
        name: link.name,
        applyTo: link.applyTo,
        // the page marks the document question by it; the submission holds its own check
        identityDocument: link.identityRules.document,
      },
      // the link's checks ran above on this request; the published definition is read once
      form: versionView(link.version, await publishedDefinition(this.prisma, link.version.id)),
    };
  }

  async submit(
    token: string,
    body: PublicApplicationCreate,
  ): Promise<Replayable<PublicSubmission>> {
    const link = await resolveOpenLink(this.prisma, this.clock.now(), token);
    const earlier = await this.earlier(link.projectId, body.clientUuid);
    if (earlier) return { replay: true, value: earlier };
    const today = isoDateInDhaka(this.clock.now());
    const definition = await publishedDefinition(this.prisma, link.version.id);
    const checked = validate(definition, body.answers, {
      audience: 'public',
      today,
      // the document follows the project; the mobile is always asked on the open link, where no
      // volunteer stands between the office and the person
      optionalIdentity: optionalIdentityOf(link.identityRules, 'public'),
      ...(await nisabOption(this.nisab, today)),
    });
    if (!checked.ok) throw new ApiError('validation.failed', 422, undefined, checked.errors);
    const chain = addressOf(checked.standard);
    if (!chain || !(await isAddressChain(this.prisma, chain)))
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'address', code: 'validation.address_incomplete' },
      ]);
    const [divisionId, districtId, , unionId] = chain;
    const identity = await this.identityFlags(link.projectId, checked.standard);
    const flags = [PUBLIC_FLAGS.publicEntry, ...identity.flags];
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
            // the lists name the entry by the typed name until the office links it
            applicantName: typedName(checked.standard),
            flags,
            candidateBeneficiaryId: identity.candidate,
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
        await this.photos.claim(
          tx,
          link,
          body.clientUuid,
          applicationId,
          photoAnswers(checked.answers),
        );
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

  /**
   * What the verifying official will want to know, never told to the applicant: whether a live
   * profile holds the number, whether that profile is blocked, whether the same number or mobile
   * came through this link in the last day, and, for a person no profile stands for yet (an entry
   * without a number, or with a number nobody holds), the blocked profile that person looks like,
   * kept as the entry's candidate.
   */
  private async identityFlags(
    projectId: string,
    standard: Record<string, unknown>,
  ): Promise<{ flags: string[]; candidate: string | null }> {
    const columns = new Map(Object.entries(standard));
    const text = (name: string) => {
      const value = columns.get(name);
      return typeof value === 'string' && value !== '' ? value : null;
    };
    const flags: string[] = [];
    const identity = identityOf(standard);
    const mobile = text('mobile');
    let live: string | null = null;
    if (identity) {
      const holder = await this.prisma.beneficiary.findFirst({
        where: identity.column === 'nid' ? { nid: identity.number } : { birthReg: identity.number },
        select: { id: true },
      });
      live = holder ? await this.identity.liveOf(this.prisma, holder.id) : null;
      if (live) {
        flags.push(PUBLIC_FLAGS.existingIdentity);
        const profile = await this.prisma.beneficiary.findUnique({
          where: { id: live },
          select: { isBlocked: true },
        });
        if (profile?.isBlocked) flags.push(PUBLIC_FLAGS.identityBlocked);
      }
    }
    const terms = [...(identity ? [identity.number] : []), ...(mobile ? [mobile] : [])];
    if (terms.length && (await this.repeatedToday(this.prisma, projectId, terms)))
      flags.push(PUBLIC_FLAGS.identityRepeated);
    // a person the verification would make a new profile for is compared with the block list:
    // one with a number no profile holds, or one without a number (an entry reaches here without
    // one only where the project lets the document be left out)
    const person = live ? null : personKeysOf(standard);
    const candidate = person ? await this.identity.blockedNamesake(this.prisma, person) : null;
    if (candidate) flags.push(BLOCKED_NAME_MATCH);
    return { flags, candidate };
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
        AND f.standard_column IN ('nid_or_birth_reg', 'mobile')
        AND a.value->>'v' IN (${Prisma.join(terms)})
      LIMIT 1`;
    return rows.length > 0;
  }
}
