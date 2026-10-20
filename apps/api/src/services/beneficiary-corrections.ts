import { uuidv7 } from '@css/shared';
import type { CorrectionRequestCreate, LockedField } from '@css/shared/beneficiaries';
import type { DecisionRequest } from '@css/shared/registration';
import type { AccessService } from '../access/service';
import { beneficiaryWhere, type Scope } from '../access/scope';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { PrismaService, Tx } from '../core/prisma.service';
import { ApiError } from '../i18n/api-error';
import type { BeneficiaryIdentityService } from './beneficiary-identity';

/** The column of each locked field. */
const COLUMN = {
  name: 'name',
  father_or_husband_name: 'fatherOrHusbandName',
  nid: 'nid',
  birth_reg: 'birthReg',
} as const satisfies Record<LockedField, string>;

const VIEW = {
  id: true,
  beneficiaryId: true,
  field: true,
  oldValue: true,
  newValue: true,
  reason: true,
  status: true,
  requestedBy: true,
  createdAt: true,
  decidedBy: true,
  decidedAt: true,
} as const;

/**
 * A profile correction request (BD-02): the only way the name, the father's or husband's name and
 * the identity numbers of a beneficiary change. One official requests it with the new value and a
 * reason; another official decides, never the requester; an approval re-checks that the value is
 * still the one the request saw and applies it in the same transaction, logged and audited. One
 * request per field waits at a time.
 */
export class BeneficiaryCorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditWriter,
    private readonly identity: BeneficiaryIdentityService,
  ) {}

  private async live(tx: Tx, actor: Principal, scope: Scope, beneficiaryId: string) {
    const b = await tx.beneficiary.findFirst({
      where: { AND: [{ id: beneficiaryId, mergedIntoId: null }, beneficiaryWhere(scope)] },
      select: { id: true, name: true, fatherOrHusbandName: true, nid: true, birthReg: true },
    });
    if (!b) {
      this.access.denied(actor.userId, scope.permission, 'beneficiary');
      throw new ApiError('permission.not_found', 404);
    }
    return b;
  }

  /** Refuses a new identity number another profile holds; the approval checks it again. */
  private async assertIdentityFree(tx: Tx, actor: Principal, field: LockedField, value: string) {
    if (field !== 'nid' && field !== 'birth_reg') return;
    const holder = await tx.beneficiary.findFirst({
      where: field === 'nid' ? { nid: value } : { birthReg: value },
      select: { id: true },
    });
    if (holder) throw await this.identity.identityTaken(tx, actor, holder.id, 'newValue');
  }

  async request(
    actor: Principal,
    scope: Scope,
    beneficiaryId: string,
    body: CorrectionRequestCreate,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM beneficiaries WHERE id = ${beneficiaryId}::uuid FOR UPDATE`;
      const b = await this.live(tx, actor, scope, beneficiaryId);
      const waiting = await tx.profileCorrectionRequest.count({
        where: { beneficiaryId, field: body.field, status: 'submitted' },
      });
      if (waiting) throw new ApiError('beneficiary.correction_pending', 409);
      await this.assertIdentityFree(tx, actor, body.field, body.newValue);
      const current = b[COLUMN[body.field]];
      const row = await tx.profileCorrectionRequest.create({
        data: {
          id: uuidv7(),
          beneficiaryId,
          field: body.field,
          oldValue: current ?? '',
          newValue: body.newValue,
          reason: body.reason,
          requestedBy: actor.userId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
        select: VIEW,
      });
      await this.audit.record(tx, {
        action: 'beneficiary.correction_requested',
        entityType: 'beneficiary',
        entityId: beneficiaryId,
        new: { requestId: row.id, field: body.field },
        reason: body.reason,
      });
      return this.view(tx, actor, row);
    });
  }

  async decide(actor: Principal, scope: Scope, requestId: string, body: DecisionRequest) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM profile_correction_requests WHERE id = ${requestId}::uuid FOR UPDATE`;
      const found = await tx.profileCorrectionRequest.findFirst({
        where: {
          id: requestId,
          beneficiary: { AND: [{ mergedIntoId: null }, beneficiaryWhere(scope)] },
        },
        select: VIEW,
      });
      if (!found) {
        this.access.denied(actor.userId, scope.permission, 'beneficiary');
        throw new ApiError('permission.not_found', 404);
      }
      if (found.status !== 'submitted') throw new ApiError('user.transition_not_allowed', 409);
      // two people for every identity change
      if (found.requestedBy === actor.userId) {
        this.access.denied(actor.userId, scope.permission, 'beneficiary');
        throw new ApiError('beneficiary.correction_own', 403);
      }
      const field = found.field as LockedField;
      const column = COLUMN[field];
      if (body.decision === 'approve') {
        await tx.$queryRaw`SELECT id FROM beneficiaries WHERE id = ${found.beneficiaryId}::uuid FOR UPDATE`;
        const b = await this.live(tx, actor, scope, found.beneficiaryId);
        if ((b[column] ?? '') !== found.oldValue)
          throw new ApiError('beneficiary.correction_stale', 409);
        await this.assertIdentityFree(tx, actor, field, found.newValue);
        await tx.beneficiary.update({
          where: { id: found.beneficiaryId },
          data: { [column]: found.newValue, updatedBy: actor.userId },
        });
        await tx.fieldChange.create({
          data: {
            id: uuidv7(),
            entityType: 'beneficiary',
            entityId: found.beneficiaryId,
            field,
            oldValue: found.oldValue,
            newValue: found.newValue,
            kind: 'correction',
            requestedBy: found.requestedBy,
            approvedBy: actor.userId,
            reason: found.reason,
            createdBy: actor.userId,
          },
        });
      }
      const row = await tx.profileCorrectionRequest.update({
        where: { id: requestId },
        data: {
          status: body.decision === 'approve' ? 'approved' : 'rejected',
          decidedBy: actor.userId,
          decidedAt: new Date(),
          updatedBy: actor.userId,
        },
        select: VIEW,
      });
      // the audit keeps the values only for a field the change log keeps too
      await this.audit.record(tx, {
        action: 'beneficiary.correction_decided',
        entityType: 'beneficiary',
        entityId: found.beneficiaryId,
        old: { [column]: found.oldValue },
        new: {
          ...(body.decision === 'approve' ? { [column]: found.newValue } : {}),
          decision: body.decision,
        },
        reason: body.reason ?? null,
      });
      return this.view(tx, actor, row);
    });
  }

  /**
   * One request as the caller may see it: the old and new value of an identity number only inside
   * the caller's `beneficiary.view_nid` scope, the rest as they are.
   */
  private async view(
    tx: Tx,
    actor: Principal,
    row: {
      id: string;
      beneficiaryId: string;
      field: string;
      oldValue: string;
      newValue: string;
      reason: string;
      status: string;
      requestedBy: string;
      createdAt: Date;
      decidedBy: string | null;
      decidedAt: Date | null;
    },
  ) {
    let seesValues = row.field !== 'nid' && row.field !== 'birth_reg';
    if (!seesValues) {
      const access = await this.access.load(actor.userId, tx);
      const nidScope = await this.access.sensitiveScope(
        actor,
        access,
        'beneficiary.view_nid',
        'beneficiary',
      );
      seesValues =
        !!nidScope &&
        (await this.access.reaches(nidScope, { beneficiaryId: row.beneficiaryId }, tx));
    }
    return {
      id: row.id,
      beneficiaryId: row.beneficiaryId,
      field: row.field,
      oldValue: seesValues ? row.oldValue : null,
      newValue: seesValues ? row.newValue : null,
      reason: row.reason,
      status: row.status,
      requestedBy: row.requestedBy,
      requestedAt: row.createdAt.toISOString(),
      decidedBy: row.decidedBy,
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    };
  }
}
