import { uuidv7 } from '@css/shared';
import type { ContactUpdate } from '@css/shared/beneficiaries';
import type { AccessService } from '../access/service';
import { beneficiaryWhere, type Scope } from '../access/scope';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import { assertIfMatch } from '../core/etag';
import type { PrismaService, Tx } from '../core/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import type { BeneficiaryIdentityService } from './beneficiary-identity';
import type { BeneficiaryMergeCandidatesService } from './beneficiary-merge-candidates';

/** The contact columns an official edits outside an application, in the order they are logged. */
const CONTACT_FIELDS = [
  'mobile',
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

const SELECT = {
  id: true,
  updatedAt: true,
  ...Object.fromEntries(CONTACT_FIELDS.map((f) => [f, true])),
} as { id: true; updatedAt: true } & Record<ContactField, true>;

/** The database's own refusal of a volunteer's mobile, raised at commit by a deferred trigger. */
const isVolunteerMobileRefusal = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  JSON.stringify(error.meta ?? {}).includes('beneficiary_mobile_is_volunteer_mobile');

/**
 * The contact data of a beneficiary edited outside an application (the mobile and the address down
 * to village, post office and landmark): every changed field is logged with its old and new value,
 * and the identity fields never change this way. The four places of the address must form one
 * chain, and the mobile may not be a volunteer's own on one of the person's applications.
 */
export class BeneficiaryContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditWriter,
    private readonly identity: BeneficiaryIdentityService,
    private readonly candidates: BeneficiaryMergeCandidatesService,
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
        const changed = CONTACT_FIELDS.filter(
          // eslint-disable-next-line security/detect-object-injection -- a fixed list of column names
          (field) => body[field] !== undefined && body[field] !== before[field],
        );
        if (body.unionId !== undefined) await this.assertChain(tx, body);
        let warnings: Awaited<ReturnType<BeneficiaryIdentityService['sharedMobile']>> = [];
        if (body.mobile !== undefined && changed.includes('mobile')) {
          // the volunteers an application of the person belongs to, as the database checks them
          const applications = await tx.application.findMany({
            where: { beneficiaryId, status: { not: 'deleted' } },
            select: { createdByUserId: true, ownerVolunteer: { select: { userId: true } } },
          });
          await this.identity.assertNotVolunteerMobile(tx, body.mobile, [
            actor.userId,
            ...applications.flatMap((a) => [
              ...(a.ownerVolunteer ? [a.ownerVolunteer.userId] : []),
              ...(a.createdByUserId ? [a.createdByUserId] : []),
            ]),
          ]);
          warnings = await this.identity.sharedMobile(tx, actor, body.mobile, beneficiaryId);
        }
        const pick = (row: Record<ContactField, unknown>) =>
          // eslint-disable-next-line security/detect-object-injection -- a fixed list of column names
          Object.fromEntries(changed.map((field) => [field, row[field]]));
        const after = changed.length
          ? await tx.beneficiary.update({
              where: { id: beneficiaryId },
              data: { ...pick(body as Record<ContactField, unknown>), updatedBy: actor.userId },
              select: SELECT,
            })
          : before;
        if (changed.length) {
          await tx.fieldChange.createMany({
            data: changed.map((field) => ({
              id: uuidv7(),
              entityType: 'beneficiary',
              entityId: beneficiaryId,
              field: snake(field),
              // eslint-disable-next-line security/detect-object-injection -- a fixed list of column names
              oldValue: (before[field] ?? Prisma.JsonNull) as Prisma.InputJsonValue,
              // eslint-disable-next-line security/detect-object-injection -- a fixed list of column names
              newValue: (after[field] ?? Prisma.JsonNull) as Prisma.InputJsonValue,
              kind: 'contact_update',
              createdBy: actor.userId,
            })),
          });
        }
        // a new mobile or union changes which profiles look like the same person
        if (changed.includes('mobile') || changed.includes('unionId'))
          await this.candidates.refreshFor(tx, [beneficiaryId]);
        await this.audit.record(tx, {
          action: 'beneficiary.contact_updated',
          entityType: 'beneficiary',
          entityId: beneficiaryId,
          old: pick(before) as Prisma.InputJsonValue,
          new: pick(after) as Prisma.InputJsonValue,
        });
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

  /** The four places of an address must be a division, a district in it, and so on down. */
  private async assertChain(tx: Tx, body: ContactUpdate): Promise<void> {
    const ids = [body.divisionId, body.districtId, body.upazilaId, body.unionId] as string[];
    const rows = await tx.location.findMany({
      where: { id: { in: ids }, active: true },
      select: { id: true, parentId: true, level: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const levels = ['division', 'district', 'upazila', 'union'];
    const chain = ids.every((id, i) => {
      const row = byId.get(id);
      // eslint-disable-next-line security/detect-object-injection -- index of a fixed list
      return !!row && row.level === levels[i] && (i === 0 || row.parentId === ids[i - 1]);
    });
    if (!chain)
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'unionId', code: 'validation.failed' },
      ]);
  }
}

/** The column name of a field, as the change log names it. */
const snake = (field: string) => field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
