import { uuidv7 } from '@css/shared';
import { type ContactUpdate, mobileOwnerOf } from '@css/shared/beneficiaries';
import type { AccessService } from '../access/service.js';
import { beneficiaryWhere, type Scope } from '../access/scope.js';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Principal } from '../auth/principal.js';
import { assertIfMatch } from '../core/etag.js';
import { isVolunteerMobileRefusal } from '../core/db-errors.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../i18n/api-error.js';
import type { BeneficiaryIdentityService } from './beneficiary-identity.js';
import type { BeneficiaryMergeCandidatesService } from './beneficiary-merge-candidates.js';
import { isAddressChain } from './locations.js';
import type { MatchKeysService, ProfileKeys } from './match-keys.js';

/**
 * The contact columns of a profile, in the order they are logged. An official edits them outside
 * an application, all but whose number the mobile is, which comes with an application's answers.
 */
const CONTACT_FIELDS = [
  'mobile',
  'mobileOwnerCode',
  'mobileOwnerName',
  'divisionId',
  'districtId',
  'upazilaId',
  'unionId',
  'village',
  'postOffice',
  'postCode',
  'landmark',
] as const;
type ContactField = (typeof CONTACT_FIELDS)[number];
/**
 * A change of a profile's contact data: what the contact edit takes, and whose number the mobile
 * is with that person's name, which only an application's answers say (the edit's own request has
 * no such key).
 */
export type ContactChange = ContactUpdate & {
  mobileOwnerCode?: string | null;
  mobileOwnerName?: string | null;
};
/** The contact columns of a profile, with its version. */
export type ContactRow = { id: string; updatedAt: Date } & Record<ContactField, unknown>;

const SELECT = {
  id: true,
  updatedAt: true,
  ...Object.fromEntries(CONTACT_FIELDS.map((f) => [f, true])),
} as { id: true; updatedAt: true } & Record<ContactField, true>;

/**
 * The contact data of a beneficiary edited outside an application (the mobile and the address down
 * to village, post office and landmark): every changed field is logged with its old and new value,
 * and the identity fields never change this way. The four places of the address must form one
 * chain, and the mobile may not be a volunteer's own on one of the person's applications. Whose
 * number the mobile is belongs to the number: a new number starts without an owner unless the
 * same change says whose it is, and an owner is never kept without a number.
 */
export class BeneficiaryContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditWriter,
    private readonly identity: BeneficiaryIdentityService,
    private readonly candidates: BeneficiaryMergeCandidatesService,
    private readonly matchKeys: MatchKeysService,
  ) {}

  async update(
    actor: Principal,
    scope: Scope,
    beneficiaryId: string,
    body: ContactUpdate,
    ifMatch: string | undefined,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM beneficiaries WHERE id = ${beneficiaryId}::uuid FOR UPDATE`;
        const before = await tx.beneficiary.findFirst({
          where: { AND: [{ id: beneficiaryId, mergedIntoId: null }, beneficiaryWhere(scope)] },
          select: SELECT,
        });
        if (!before) {
          this.access.denied(actor.userId, scope.permission, 'beneficiary');
          throw new ApiError('permission.not_found', 404);
        }
        assertIfMatch(ifMatch, before.updatedAt);
        const { after, warnings } = await this.apply(tx, actor, before, body);
        const { updatedAt, ...contact } = after;
        return { contact: { ...contact, warnings }, updatedAt };
      });
    } catch (error) {
      // the deferred trigger that backs up the own-mobile check refuses at commit
      if (isVolunteerMobileRefusal(error))
        throw new ApiError('beneficiary.mobile_is_volunteer_mobile', 409);
      throw error;
    }
  }

  /** The contact columns of a live profile as `apply` reads them; the caller holds the row lock. */
  async locked(tx: Tx, beneficiaryId: string): Promise<ContactRow> {
    await tx.$queryRaw`SELECT id FROM beneficiaries WHERE id = ${beneficiaryId}::uuid FOR UPDATE`;
    return tx.beneficiary.findUniqueOrThrow({ where: { id: beneficiaryId }, select: SELECT });
  }

  /**
   * Writes the fields of `body` that differ from the profile, each with its change-log row, the
   * own-mobile rule and the shared-mobile warning, then the audit entry; the submission of an
   * application writes a known person's new mobile or address the same way, and its approval the
   * new mobile, with why the change came (`reason`) on each log row and in the audit entry.
   */
  async apply(
    tx: Tx,
    actor: Principal,
    before: ContactRow,
    change: ContactChange,
    options: { reason?: string } = {},
  ) {
    const body = withOwner(before, change);
    const changed = CONTACT_FIELDS.filter(
      // eslint-disable-next-line security/detect-object-injection -- a fixed list of column names
      (field) => body[field] !== undefined && body[field] !== before[field],
    );
    if (body.unionId !== undefined) await this.assertChain(tx, body);
    let warnings: Awaited<ReturnType<BeneficiaryIdentityService['sharedMobile']>> = [];
    if (body.mobile !== undefined && changed.includes('mobile')) {
      // the volunteers an application of the person belongs to, as the database checks them
      const applications = await tx.application.findMany({
        where: { beneficiaryId: before.id, status: { not: 'deleted' } },
        select: { createdByUserId: true, ownerVolunteer: { select: { userId: true } } },
      });
      await this.identity.assertNotVolunteerMobile(tx, body.mobile, [
        actor.userId,
        ...applications.flatMap((a) => [
          ...(a.ownerVolunteer ? [a.ownerVolunteer.userId] : []),
          ...(a.createdByUserId ? [a.createdByUserId] : []),
        ]),
      ]);
      warnings = await this.identity.sharedMobile(tx, actor, body.mobile, before.id);
    }
    const pick = (row: Record<ContactField, unknown>) =>
      // eslint-disable-next-line security/detect-object-injection -- a fixed list of column names
      Object.fromEntries(changed.map((field) => [field, row[field]]));
    // a new village gives the profile new name keys, stored with the change
    const keys = changed.includes('village')
      ? await this.keysWithVillage(tx, before.id, body.village as string)
      : {};
    const after = changed.length
      ? await tx.beneficiary.update({
          where: { id: before.id },
          data: {
            ...pick(body as Record<ContactField, unknown>),
            ...keys,
            updatedBy: actor.userId,
          },
          select: SELECT,
        })
      : before;
    if (changed.length) {
      await tx.fieldChange.createMany({
        data: changed.map((field) => ({
          id: uuidv7(),
          entityType: 'beneficiary',
          entityId: before.id,
          field: snake(field),
          // eslint-disable-next-line security/detect-object-injection -- a fixed list of column names
          oldValue: (before[field] ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          // eslint-disable-next-line security/detect-object-injection -- a fixed list of column names
          newValue: (after[field] ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          kind: 'contact_update',
          reason: options.reason ?? null,
          createdBy: actor.userId,
        })),
      });
      // a new mobile or union changes which profiles look like the same person
      if (changed.includes('mobile') || changed.includes('unionId'))
        await this.candidates.refreshFor(tx, [before.id]);
    }
    // the entry is written for a save that changed nothing too, as the contact route always did
    await this.audit.record(tx, {
      action: 'beneficiary.contact_updated',
      entityType: 'beneficiary',
      entityId: before.id,
      old: pick(before) as Prisma.InputJsonValue,
      new: pick(after) as Prisma.InputJsonValue,
      ...(options.reason ? { reason: options.reason } : {}),
    });
    return { after, warnings, changed };
  }

  /** The name keys of a profile that moves to another village. */
  private async keysWithVillage(tx: Tx, id: string, village: string): Promise<ProfileKeys> {
    const person = await tx.beneficiary.findUniqueOrThrow({
      where: { id },
      select: { name: true, fatherOrHusbandName: true },
    });
    return this.matchKeys.ofProfile(tx, { ...person, village });
  }

  /** The four places of an address must be a division, a district in it, and so on down. */
  private async assertChain(tx: Tx, body: ContactChange): Promise<void> {
    const ids = [body.divisionId, body.districtId, body.upazilaId, body.unionId] as string[];
    if (!(await isAddressChain(tx, ids)))
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'unionId', code: 'validation.failed' },
      ]);
  }
}

/**
 * The change with the owner of the number as the profile keeps it: the owner the change names, by
 * the rule of `mobileOwnerOf` against the number the profile will hold; without one, nothing of
 * the owner changes while the number stays, and both are emptied when the number changes (the old
 * owner was said of the old number). A name is never written without its owner.
 */
function withOwner(before: ContactRow, change: ContactChange): ContactChange {
  const { mobileOwnerCode, mobileOwnerName, ...rest } = change;
  if (mobileOwnerCode !== undefined) {
    const mobile = change.mobile ?? (typeof before.mobile === 'string' ? before.mobile : null);
    const owner = mobileOwnerOf(mobile, mobileOwnerCode, mobileOwnerName);
    return { ...rest, mobileOwnerCode: owner.code, mobileOwnerName: owner.name };
  }
  if (change.mobile !== undefined && change.mobile !== before.mobile)
    return { ...rest, mobileOwnerCode: null, mobileOwnerName: null };
  return rest;
}

/** The column name of a field, as the change log names it. */
const snake = (field: string) => field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
