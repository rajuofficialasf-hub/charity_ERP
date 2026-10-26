import { uuidv7 } from '@css/shared';
import { type ContactUpdate, contactUpdateSchema } from '@css/shared/beneficiaries';
import { isoDateInDhaka } from '@css/shared/format';
import {
  type Answer,
  type FormDefinition,
  type UnlockCancel,
  type UnlockDecisionRequest,
  type UnlockOpen,
  type UnlockValue,
  UNLOCK_DECISIONS,
  UNLOCK_STATES,
  unlockRefusal,
  validate,
} from '@css/shared/forms';
import { z } from 'zod';
import { applicationWhere, holdsPermission } from '../access/scope';
import type { EffectiveAccess } from '../access/effective';
import type { AccessService } from '../access/service';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { Clock } from '../core/clock';
import { isUniqueViolation, isVolunteerMobileRefusal } from '../core/db-errors';
import type { PrismaService, Tx } from '../core/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import type { ApplicationEvents } from '../notifications/application-events';
import type { BeneficiaryContactService } from '../services/beneficiary-contact';
import { readDefinition } from '../services/forms';
import { isAddressChain } from '../services/locations';
import type { NisabService } from '../services/nisab';
import { addressOf, fieldsOf, nisabOption, readAnswers, writeAnswers } from './answers';
import { assertReachesApplication, isBlockedVolunteer, reachesApplication } from './callers';

/** Opens, decides and cancels an unlock; held by the region's RPM and Project Executive. */
export const UNLOCK_PERMISSION = 'application.unlock_field';
/** Fills an open answer; held by the volunteer on their own applications. */
export const FILL_PERMISSION = 'application.update_unlocked_field';
/** The states of an application whose answers may be opened: approved and after. */
const UNLOCKABLE_STATES = ['approved', 'implementation', 'completed'];

/**
 * The contact columns a field's answer writes to the person's profile, and the profile field of
 * each: a mobile or an address corrected through an unlock reaches the profile through the
 * contact service, with its own change log.
 */
const CONTACT_COLUMNS: Record<string, keyof ContactUpdate> = {
  mobile: 'mobile',
  division_id: 'divisionId',
  district_id: 'districtId',
  upazila_id: 'upazilaId',
  union_id: 'unionId',
  village: 'village',
  post_office: 'postOffice',
  post_code: 'postCode',
  landmark: 'landmark',
};

const UNLOCK_SELECT = {
  id: true,
  entityId: true,
  field: true,
  oldValue: true,
  newValue: true,
  unlockState: true,
  reason: true,
  requestedBy: true,
  createdAt: true,
  enteredBy: true,
  enteredAt: true,
  decidedBy: true,
  decidedAt: true,
  decision: true,
  decisionReason: true,
} satisfies Prisma.FieldChangeSelect;
type UnlockRow = Prisma.FieldChangeGetPayload<{ select: typeof UNLOCK_SELECT }>;

const uuid = z.uuid();
/** One unlock as the caller reads it; the office's reasons never reach a volunteer. */
export const unlockView = z.object({
  id: uuid,
  applicationId: uuid,
  fieldKey: z.string(),
  repeatIndex: z.number().int(),
  state: z.enum(UNLOCK_STATES),
  oldValue: z.unknown(),
  newValue: z.unknown(),
  reason: z.string().nullable(),
  openedBy: uuid.nullable(),
  openedAt: z.string(),
  enteredBy: uuid.nullable(),
  enteredAt: z.string().nullable(),
  decidedBy: uuid.nullable(),
  decidedAt: z.string().nullable(),
  decision: z.enum(UNLOCK_DECISIONS).nullable(),
  decisionReason: z.string().nullable(),
  /** What the caller may do with it now. */
  mayFill: z.boolean(),
  mayDecide: z.boolean(),
  mayCancel: z.boolean(),
});
export type UnlockView = z.infer<typeof unlockView>;

/** The answer an unlock names: its question and the row of a repeat group (`key` or `key[2]`). */
const fieldName = (fieldKey: string, repeatIndex: number) =>
  repeatIndex ? `${fieldKey}[${repeatIndex}]` : fieldKey;
function answerOf(field: string): { fieldKey: string; repeatIndex: number } {
  const match = /^(.+?)(?:\[(\d+)\])?$/.exec(field);
  return { fieldKey: match?.[1] ?? field, repeatIndex: Number(match?.[2] ?? 0) };
}

type Field = FormDefinition['sections'][number]['fields'][number];
/** The question of the definition and whether its section is the official one. */
function questionOf(
  definition: FormDefinition,
  fieldKey: string,
): { field: Field; officialOnly: boolean } | null {
  for (const section of definition.sections) {
    const field = section.fields.find((f) => f.fieldKey === fieldKey);
    if (field) return { field, officialOnly: section.visibility === 'official_only' };
  }
  return null;
}

/** How many waiting unlocks the attention counts read at most. */
const ATTENTION_LIMIT = 500;

/** The profile's contact columns a question writes, when it writes any. */
const contactColumns = (field: { standardColumn?: string | null }) =>
  (field.standardColumn ?? '').split(',').filter((c) => Object.hasOwn(CONTACT_COLUMNS, c));
/** A cleared answer: none, or an empty text. */
const isBlank = (value: unknown) =>
  value === null ||
  (typeof (value as { v?: unknown }).v === 'string' && !(value as { v: string }).v.trim());

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const json = (value: unknown) => (value ?? Prisma.JsonNull) as Prisma.InputJsonValue;

interface Target {
  id: string;
  projectId: string;
  status: string;
  formVersionId: string;
  beneficiaryId: string | null;
  createdByUserId: string | null;
  ownerVolunteerId: string | null;
  ownerUserId: string | null;
  projectClosed: boolean;
}

/**
 * The field unlock of an approved application (docs/architecture/WORKFLOW_ENGINE.md,
 * field unlock): one answer is opened by an official with a reason; the volunteer who owns the
 * application enters the new value, or an official when it has no volunteer or the answer belongs
 * to the official section; an official other than the one who entered decides. An accepted value
 * replaces the answer, and a mobile or an address also reaches the person's profile through the
 * contact service; a refusal or a cancel keeps the old value. Each step is a column of one
 * `field_changes` row and an audit entry; one unlock per answer waits at a time, and nothing moves
 * on a closed project. The identity, photos, files and calculated answers never open.
 */
export class UnlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditWriter,
    private readonly clock: Clock,
    private readonly nisab: NisabService,
    private readonly contact: BeneficiaryContactService,
    private readonly events: ApplicationEvents,
  ) {}

  async open(principal: Principal, applicationId: string, body: UnlockOpen): Promise<UnlockView> {
    const access = await this.access.load(principal.userId);
    await this.assertMay(principal, access, UNLOCK_PERMISSION, applicationId);
    const id = await this.write(async (tx) => {
      const target = await this.target(tx, applicationId);
      this.assertOpenable(target);
      const definition = await readDefinition(tx, target.formVersionId, 'official');
      const question = questionOf(definition, body.fieldKey);
      if (!question)
        throw new ApiError('validation.failed', 422, undefined, [
          { path: 'fieldKey', code: 'validation.option_unknown' },
        ]);
      const refusal = unlockRefusal(question.field);
      if (refusal)
        throw new ApiError('validation.failed', 422, undefined, [
          { path: 'fieldKey', code: `application.unlock_${refusal}` },
        ]);
      // only a question inside a repeat group has rows beyond the first
      if (body.repeatIndex > 0 && !question.field.settings?.repeat?.group)
        throw new ApiError('validation.failed', 422, undefined, [
          { path: 'repeatIndex', code: 'validation.out_of_range' },
        ]);
      const stored = await readAnswers(tx, applicationId, definition);
      const old = stored.find(
        (a) => a.fieldKey === body.fieldKey && (a.repeatIndex ?? 0) === body.repeatIndex,
      );
      const row = await tx.fieldChange.create({
        data: {
          id: uuidv7(),
          entityType: 'application',
          entityId: applicationId,
          field: fieldName(body.fieldKey, body.repeatIndex),
          oldValue: json(old?.value),
          kind: 'unlock',
          unlockState: 'open',
          requestedBy: principal.userId,
          reason: body.reason,
          createdBy: principal.userId,
        },
        select: { id: true },
      });
      await this.audit.record(tx, {
        action: 'application.unlock_opened',
        entityType: 'application',
        entityId: applicationId,
        new: { unlockId: row.id, field: fieldName(body.fieldKey, body.repeatIndex) },
        reason: body.reason,
      });
      // the volunteer hears which question opened, never the office's reason; an answer of the
      // official section is the office's own to fill
      if (target.ownerUserId && !question.officialOnly)
        await this.events.publishUnlock(tx, 'field_unlocked', {
          application: target,
          question: question.field.label,
          to: target.ownerUserId,
          actorId: principal.userId,
        });
      return row.id;
    }, 'application.unlock_open');
    return this.viewOf(principal, access, id);
  }

  async fill(principal: Principal, unlockId: string, body: UnlockValue): Promise<UnlockView> {
    const access = await this.access.load(principal.userId);
    await this.write(async (tx) => {
      const unlock = await this.lockedUnlock(tx, unlockId);
      const target = await this.target(tx, unlock.entityId);
      const definition = await readDefinition(tx, target.formVersionId, 'official');
      const { fieldKey, repeatIndex } = answerOf(unlock.field);
      const question = questionOf(definition, fieldKey);
      await this.assertFiller(principal, access, target, question?.officialOnly ?? true);
      if (unlock.unlockState !== 'open') throw new ApiError('application.unlock_not_open', 409);
      this.assertOpenable(target);
      if (!question) throw new ApiError('application.unlock_not_open', 409);
      // the new value is checked as one answer among the others, as a submission checks it, and
      // kept as the engine read it
      const { value } = await this.checked(tx, target, definition, {
        fieldKey,
        repeatIndex,
        value: body.value,
      });
      if (isBlank(value) && contactColumns(question.field).length)
        throw new ApiError('validation.failed', 422, undefined, [
          { path: 'value', code: 'application.unlock_cleared' },
        ]);
      if (same(value, unlock.oldValue))
        throw new ApiError('validation.failed', 422, undefined, [
          { path: 'value', code: 'application.unlock_unchanged' },
        ]);
      const now = this.clock.now();
      await tx.fieldChange.update({
        where: { id: unlockId },
        data: {
          newValue: json(value),
          enteredBy: principal.userId,
          enteredAt: now,
          unlockState: 'updated',
        },
      });
      await this.audit.record(tx, {
        action: 'application.unlock_entered',
        entityType: 'application',
        entityId: target.id,
        new: { unlockId, field: unlock.field },
      });
      if (unlock.requestedBy && unlock.requestedBy !== principal.userId)
        await this.events.publishUnlock(tx, 'field_updated', {
          application: target,
          question: question.field.label,
          to: unlock.requestedBy,
          actorId: principal.userId,
        });
    });
    return this.viewOf(principal, access, unlockId);
  }

  async decide(
    principal: Principal,
    unlockId: string,
    body: UnlockDecisionRequest,
  ): Promise<UnlockView> {
    const access = await this.access.load(principal.userId);
    await this.assertMay(principal, access, UNLOCK_PERMISSION, await this.applicationOf(unlockId));
    await this.write(async (tx) => {
      const unlock = await this.lockedUnlock(tx, unlockId);
      // two acceptances on one application rewrite its answers one after another
      await tx.$queryRaw`SELECT id FROM applications WHERE id = ${unlock.entityId}::uuid FOR UPDATE`;
      if (unlock.unlockState !== 'updated') throw new ApiError('application.unlock_not_open', 409);
      // two people for every corrected answer
      if (unlock.enteredBy === principal.userId) {
        this.access.denied(principal.userId, UNLOCK_PERMISSION, 'application');
        throw new ApiError('application.unlock_own_entry', 403);
      }
      const target = await this.target(tx, unlock.entityId);
      this.assertOpenable(target);
      const accepted = body.decision === 'accept';
      if (accepted) await this.accept(tx, principal, target, unlock);
      const now = this.clock.now();
      await tx.fieldChange.update({
        where: { id: unlockId },
        data: {
          unlockState: 'relocked',
          decision: accepted ? 'accepted' : 'refused',
          decisionReason: body.reason ?? null,
          decidedBy: principal.userId,
          decidedAt: now,
          ...(accepted ? { approvedBy: principal.userId } : {}),
        },
      });
      await this.audit.record(tx, {
        action: 'application.unlock_decided',
        entityType: 'application',
        entityId: target.id,
        old: { field: unlock.field, value: json(unlock.oldValue) },
        new: {
          unlockId,
          field: unlock.field,
          decision: accepted ? 'accepted' : 'refused',
          ...(accepted ? { value: json(unlock.newValue) } : {}),
        },
        reason: body.reason ?? null,
      });
    });
    return this.viewOf(principal, access, unlockId);
  }

  async cancel(principal: Principal, unlockId: string, body: UnlockCancel): Promise<UnlockView> {
    const access = await this.access.load(principal.userId);
    await this.assertMay(principal, access, UNLOCK_PERMISSION, await this.applicationOf(unlockId));
    await this.write(async (tx) => {
      const unlock = await this.lockedUnlock(tx, unlockId);
      if (unlock.decidedAt) throw new ApiError('application.unlock_not_open', 409);
      const target = await this.target(tx, unlock.entityId);
      this.assertOpenable(target);
      await tx.fieldChange.update({
        where: { id: unlockId },
        data: {
          unlockState: 'relocked',
          decision: 'cancelled',
          decisionReason: body.reason,
          decidedBy: principal.userId,
          decidedAt: this.clock.now(),
        },
      });
      await this.audit.record(tx, {
        action: 'application.unlock_cancelled',
        entityType: 'application',
        entityId: target.id,
        new: { unlockId, field: unlock.field },
        reason: body.reason,
      });
    });
    return this.viewOf(principal, access, unlockId);
  }

  /**
   * The unlocks of an application that wait for a step, as the caller may see them: a volunteer
   * sees only the answers they may read, without the office's reasons; whether the caller may
   * open an answer of this application now.
   */
  async forRecord(
    principal: Principal,
    access: EffectiveAccess,
    applicationId: string,
    official: boolean,
  ): Promise<{ unlocks: UnlockView[]; mayUnlock: boolean }> {
    const rows = await this.prisma.fieldChange.findMany({
      where: {
        entityType: 'application',
        entityId: applicationId,
        kind: 'unlock',
        decidedAt: null,
      },
      select: UNLOCK_SELECT,
      orderBy: { id: 'asc' },
    });
    const target = await this.target(this.prisma, applicationId);
    const definition = await readDefinition(
      this.prisma,
      target.formVersionId,
      official ? 'official' : 'volunteer',
    );
    const officer = await this.reaches(principal, access, UNLOCK_PERMISSION, applicationId);
    const filler = await this.reaches(principal, access, FILL_PERMISSION, applicationId);
    const unlocks = rows.flatMap((row) => {
      const question = questionOf(definition, answerOf(row.field).fieldKey);
      return question
        ? [this.view(row, principal, target, { officer, filler, official, question })]
        : [];
    });
    const mayUnlock = officer && UNLOCKABLE_STATES.includes(target.status) && !target.projectClosed;
    return { unlocks, mayUnlock };
  }

  /**
   * The unlocks of the caller's own applications waiting for their new value, on projects that are
   * not closed (a closed project takes no step, so its unlocks wait for nobody).
   */
  async waitingToFill(principal: Principal): Promise<number> {
    if (principal.kind !== 'volunteer') return 0;
    const own = await this.prisma.volunteer.findUnique({
      where: { userId: principal.userId },
      select: { id: true },
    });
    if (!own || (await isBlockedVolunteer(this.prisma, principal.userId))) return 0;
    const rows = await this.prisma.$queryRaw<{ field: string; form_version_id: string }[]>`
      SELECT fc.field, a.form_version_id
        FROM field_changes fc
        JOIN applications a ON a.id = fc.entity_id
        JOIN projects p ON p.id = a.project_id
       WHERE fc.entity_type = 'application' AND fc.kind = 'unlock' AND fc.unlock_state = 'open'
         AND a.owner_volunteer_id = ${own.id}::uuid
         AND a.status = ANY(${UNLOCKABLE_STATES}::text[]) AND p.status <> 'closed'
       LIMIT ${ATTENTION_LIMIT}`;
    const definitions = new Map<string, FormDefinition>();
    let count = 0;
    for (const row of rows) {
      if (!definitions.has(row.form_version_id))
        definitions.set(
          row.form_version_id,
          await readDefinition(this.prisma, row.form_version_id, 'volunteer'),
        );
      // the answers of the official section are the office's to fill
      if (questionOf(definitions.get(row.form_version_id)!, answerOf(row.field).fieldKey)) count++;
    }
    return count;
  }

  /**
   * The entered values the caller may decide (inside their unlock scope, entered by someone else,
   * on projects that are not closed), and the oldest one's application, which the attention item
   * opens.
   */
  async waitingToDecide(principal: Principal): Promise<{ count: number; first: string | null }> {
    const access = await this.access.load(principal.userId);
    if (!holdsPermission(UNLOCK_PERMISSION, access.grants)) return { count: 0, first: null };
    const scope = await this.access.scopeFor(principal, access, UNLOCK_PERMISSION, 'application');
    const waiting = await this.prisma.$queryRaw<{ entity_id: string }[]>`
      SELECT fc.entity_id
        FROM field_changes fc
        JOIN applications a ON a.id = fc.entity_id
        JOIN projects p ON p.id = a.project_id
       WHERE fc.entity_type = 'application' AND fc.kind = 'unlock' AND fc.unlock_state = 'updated'
         AND fc.entered_by IS DISTINCT FROM ${principal.userId}::uuid
         AND a.status = ANY(${UNLOCKABLE_STATES}::text[]) AND p.status <> 'closed'
       ORDER BY fc.entered_at ASC
       LIMIT ${ATTENTION_LIMIT}`;
    if (!waiting.length) return { count: 0, first: null };
    const reached = new Set(
      (
        await this.prisma.application.findMany({
          where: {
            AND: [
              { id: { in: [...new Set(waiting.map((w) => w.entity_id))] } },
              applicationWhere(scope),
            ],
          },
          select: { id: true },
        })
      ).map((a) => a.id),
    );
    const mine = waiting.filter((w) => reached.has(w.entity_id));
    return { count: mine.length, first: mine[0]?.entity_id ?? null };
  }

  /** The accepted value replaces the answer; a mobile or an address reaches the profile too. */
  private async accept(tx: Tx, principal: Principal, target: Target, unlock: UnlockRow) {
    const definition = await readDefinition(tx, target.formVersionId, 'official');
    const { fieldKey, repeatIndex } = answerOf(unlock.field);
    const question = questionOf(definition, fieldKey);
    if (!question) throw new ApiError('application.unlock_not_open', 409);
    const stored = await readAnswers(tx, target.id, definition);
    const current = stored.find(
      (a) => a.fieldKey === fieldKey && (a.repeatIndex ?? 0) === repeatIndex,
    );
    // the answer must still be the one the unlock opened
    if (!same(current?.value, unlock.oldValue)) throw new ApiError('application.unlock_stale', 409);
    // the whole set is written as the engine read it, so a calculation that uses this answer
    // follows it
    const { standard, answers } = await this.checked(tx, target, definition, {
      fieldKey,
      repeatIndex,
      value: unlock.newValue,
    });
    await writeAnswers(tx, target.id, target.formVersionId, answers, principal.userId);
    const columns = (question.field.standardColumn ?? '').split(',').filter(Boolean);
    const address = columns.includes('union_id') ? addressOf(standard) : null;
    await tx.application.update({
      where: { id: target.id },
      data: {
        ...(address
          ? { regionLocationId: address[0], districtId: address[1], unionId: address[3] }
          : {}),
        updatedAt: this.clock.now(),
        updatedBy: principal.userId,
      },
    });
    const contact: Record<string, unknown> = {};
    for (const column of columns) {
      const profileField = Object.hasOwn(CONTACT_COLUMNS, column)
        ? // eslint-disable-next-line security/detect-object-injection -- checked with hasOwn
          CONTACT_COLUMNS[column]
        : undefined;
      // eslint-disable-next-line security/detect-object-injection -- a standard column name
      const value = standard[column];
      if (profileField && typeof value === 'string' && value !== '')
        // eslint-disable-next-line security/detect-object-injection -- a contact field name
        contact[profileField] = value;
    }
    if (target.beneficiaryId && Object.keys(contact).length) {
      const before = await this.contact.locked(tx, target.beneficiaryId);
      await this.contact.apply(tx, principal, before, contactUpdateSchema.parse(contact));
    }
  }

  /**
   * The answers with this one in place (or without it, when the new value clears it), checked as
   * the engine checks a whole application: the standard columns, every answer as the engine read
   * it, and this one's value. Only the errors of this answer refuse it: another answer the office
   * left empty is not this correction's concern, so the rest is read as a draft would be.
   */
  private async checked(
    tx: Tx,
    target: Target,
    definition: FormDefinition,
    answer: { fieldKey: string; repeatIndex: number; value: unknown },
  ): Promise<{
    standard: Record<string, unknown>;
    answers: Answer[];
    value: Answer['value'] | null;
  }> {
    if (!fieldsOf(definition).some((f) => f.fieldKey === answer.fieldKey))
      throw new ApiError('application.unlock_not_open', 409);
    const stored = await readAnswers(tx, target.id, definition);
    const answers = [
      ...stored.filter(
        (a) => !(a.fieldKey === answer.fieldKey && (a.repeatIndex ?? 0) === answer.repeatIndex),
      ),
      ...(answer.value === null ? [] : [answer]),
    ];
    const today = isoDateInDhaka(this.clock.now());
    const options = {
      audience: 'official' as const,
      today,
      previous: stored,
      ...(await nisabOption(this.nisab, today)),
    };
    let result = validate(definition, answers, { ...options, draft: false });
    if (!result.ok) {
      const own = result.errors.filter(
        (e) =>
          e.path === answer.fieldKey ||
          e.path.startsWith(`${answer.fieldKey}[`) ||
          e.path.startsWith(`${answer.fieldKey}.`),
      );
      if (own.length) throw new ApiError('validation.failed', 422, undefined, own);
      result = validate(definition, answers, { ...options, draft: true });
      if (!result.ok) throw new ApiError('validation.failed', 422, undefined, result.errors);
    }
    const chain = addressOf(result.standard);
    if (!chain || !(await isAddressChain(tx, chain)))
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'value', code: 'validation.address_incomplete' },
      ]);
    // an answer the form does not keep (empty, or hidden by a condition) is cleared
    const kept = result.answers.find(
      (a) => a.fieldKey === answer.fieldKey && (a.repeatIndex ?? 0) === answer.repeatIndex,
    );
    return { standard: result.standard, answers: result.answers, value: kept?.value ?? null };
  }

  /** An unlock waits only on an approved application of a project that is not closed. */
  private assertOpenable(target: Target): void {
    if (target.projectClosed) throw new ApiError('workflow.guard.project_not_closed', 409);
    if (!UNLOCKABLE_STATES.includes(target.status))
      throw new ApiError('application.not_unlockable', 409);
  }

  /**
   * Who enters the value: the owner volunteer, for an answer they may read; an official of the
   * unlock scope when the application has no volunteer or the answer is the official section's.
   * Anyone else is told the unlock does not exist.
   */
  private async assertFiller(
    principal: Principal,
    access: EffectiveAccess,
    target: Target,
    officialOnly: boolean,
  ): Promise<void> {
    if (principal.kind === 'volunteer') {
      if (officialOnly || target.ownerUserId !== principal.userId)
        throw new ApiError('permission.not_found', 404);
      if (await isBlockedVolunteer(this.prisma, principal.userId))
        throw new ApiError('permission.not_found', 404);
      await this.assertMay(principal, access, FILL_PERMISSION, target.id);
      return;
    }
    await this.assertMay(principal, access, UNLOCK_PERMISSION, target.id);
    if (target.ownerUserId && !officialOnly) {
      this.access.denied(principal.userId, FILL_PERMISSION, 'application');
      throw new ApiError('permission.denied', 403);
    }
  }

  private assertMay(
    principal: Principal,
    access: EffectiveAccess,
    permission: string,
    applicationId: string | null,
  ): Promise<void> {
    return assertReachesApplication(this.access, principal, access, permission, applicationId);
  }

  private reaches(
    principal: Principal,
    access: EffectiveAccess,
    permission: string,
    applicationId: string,
  ): Promise<boolean> {
    return reachesApplication(this.access, principal, access, permission, applicationId);
  }

  /** The application an unlock belongs to, or null for an id that names no unlock. */
  private async applicationOf(unlockId: string): Promise<string | null> {
    const row = await this.prisma.fieldChange.findFirst({
      where: { id: unlockId, entityType: 'application', kind: 'unlock' },
      select: { entityId: true },
    });
    return row?.entityId ?? null;
  }

  private async lockedUnlock(tx: Tx, unlockId: string): Promise<UnlockRow> {
    await tx.$queryRaw`SELECT id FROM field_changes WHERE id = ${unlockId}::uuid FOR UPDATE`;
    const row = await tx.fieldChange.findFirst({
      where: { id: unlockId, entityType: 'application', kind: 'unlock' },
      select: UNLOCK_SELECT,
    });
    if (!row) throw new ApiError('permission.not_found', 404);
    return row;
  }

  private async target(db: Tx | PrismaService, applicationId: string): Promise<Target> {
    const row = await db.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: {
        id: true,
        projectId: true,
        status: true,
        formVersionId: true,
        beneficiaryId: true,
        createdByUserId: true,
        ownerVolunteerId: true,
        ownerVolunteer: { select: { userId: true } },
        project: { select: { status: true } },
      },
    });
    return {
      id: row.id,
      projectId: row.projectId,
      status: row.status,
      formVersionId: row.formVersionId,
      beneficiaryId: row.beneficiaryId,
      createdByUserId: row.createdByUserId,
      ownerVolunteerId: row.ownerVolunteerId,
      ownerUserId: row.ownerVolunteer?.userId ?? null,
      projectClosed: row.project.status === 'closed',
    };
  }

  /** One transaction; a second open of the same answer meets the unique index. */
  private async write<T>(fn: (tx: Tx) => Promise<T>, onUnique?: string): Promise<T> {
    try {
      return await this.prisma.$transaction(fn);
    } catch (error) {
      if (onUnique && isUniqueViolation(error)) throw new ApiError(onUnique, 409);
      // the deferred trigger that backs up the own-mobile check refuses at commit
      if (isVolunteerMobileRefusal(error))
        throw new ApiError('beneficiary.mobile_is_volunteer_mobile', 409);
      throw error;
    }
  }

  private async viewOf(
    principal: Principal,
    access: EffectiveAccess,
    unlockId: string,
  ): Promise<UnlockView> {
    const row = await this.prisma.fieldChange.findUniqueOrThrow({
      where: { id: unlockId },
      select: UNLOCK_SELECT,
    });
    const target = await this.target(this.prisma, row.entityId);
    const official = principal.kind !== 'volunteer';
    const definition = await readDefinition(
      this.prisma,
      target.formVersionId,
      official ? 'official' : 'volunteer',
    );
    const question = questionOf(definition, answerOf(row.field).fieldKey);
    if (!question) throw new ApiError('permission.not_found', 404);
    const [officer, filler] = await Promise.all([
      this.reaches(principal, access, UNLOCK_PERMISSION, row.entityId),
      this.reaches(principal, access, FILL_PERMISSION, row.entityId),
    ]);
    return this.view(row, principal, target, { officer, filler, official, question });
  }

  private view(
    row: UnlockRow,
    principal: Principal,
    target: Target,
    who: {
      officer: boolean;
      filler: boolean;
      official: boolean;
      question: { field: Field; officialOnly: boolean };
    },
  ): UnlockView {
    const { fieldKey, repeatIndex } = answerOf(row.field);
    const waiting = !row.decidedAt && !target.projectClosed;
    const officeFills = !target.ownerUserId || who.question.officialOnly;
    const mayFill =
      waiting &&
      row.unlockState === 'open' &&
      (who.official
        ? who.officer && officeFills
        : who.filler && !officeFills && target.ownerUserId === principal.userId);
    const iso = (d: Date | null) => (d ? d.toISOString() : null);
    return {
      id: row.id,
      applicationId: row.entityId,
      fieldKey,
      repeatIndex,
      state: z.enum(UNLOCK_STATES).parse(row.unlockState),
      oldValue: row.oldValue,
      newValue: row.newValue,
      reason: who.official ? row.reason : null,
      openedBy: row.requestedBy,
      openedAt: row.createdAt.toISOString(),
      enteredBy: row.enteredBy,
      enteredAt: iso(row.enteredAt),
      decidedBy: row.decidedBy,
      decidedAt: iso(row.decidedAt),
      decision: row.decision ? z.enum(UNLOCK_DECISIONS).parse(row.decision) : null,
      decisionReason: who.official ? row.decisionReason : null,
      mayFill,
      mayDecide:
        waiting &&
        who.official &&
        who.officer &&
        row.unlockState === 'updated' &&
        row.enteredBy !== principal.userId,
      mayCancel: waiting && who.official && who.officer,
    };
  }
}
