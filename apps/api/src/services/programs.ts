import type { ProgramCreate, ProgramUpdate } from '@css/shared/projects';
import { uuidv7 } from '@css/shared';
import { type Scope, programWhere } from '../access/scope.js';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Principal } from '../auth/principal.js';
import { assertIfMatch } from '../core/etag.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../i18n/api-error.js';

const SELECT = {
  id: true,
  code: true,
  nameBn: true,
  nameEn: true,
  pmUserId: true,
  active: true,
  updatedAt: true,
  pmUser: { select: { displayName: true } },
} satisfies Prisma.ProgramSelect;

type Row = Prisma.ProgramGetPayload<{ select: typeof SELECT }>;

export interface ProgramView {
  id: string;
  code: string;
  name: { bn: string; en: string };
  pmUserId: string | null;
  pmName: string | null;
  active: boolean;
}

const view = (p: Row): ProgramView => ({
  id: p.id,
  code: p.code,
  name: { bn: p.nameBn, en: p.nameEn },
  pmUserId: p.pmUserId,
  pmName: p.pmUser?.displayName ?? null,
  active: p.active,
});

/** The project states that keep a program open. */
const OPEN_PROJECT_STATES = ['draft', 'active', 'closing'];

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * Programs (docs/MASTER_SPEC.md, "Program and project setup (project configuration)"): the
 * Department Head creates, renames, deactivates and activates them and assigns their PM; officials
 * read the programs in their scope. A program is never deleted. Every change is audited in its
 * transaction.
 */
export class ProgramsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  async list(scope: Scope): Promise<ProgramView[]> {
    const rows = await this.prisma.program.findMany({
      where: programWhere(scope),
      orderBy: { code: 'asc' },
      select: SELECT,
    });
    return rows.map(view);
  }

  async get(scope: Scope, programId: string): Promise<{ program: ProgramView; updatedAt: Date }> {
    const row = await this.find(this.prisma, scope, programId);
    return { program: view(row), updatedAt: row.updatedAt };
  }

  async create(actor: Principal, body: ProgramCreate) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (await tx.program.findUnique({ where: { code: body.code }, select: { id: true } }))
          throw new ApiError('program.code_taken', 409);
        if (body.pmUserId) await this.assertPm(tx, body.pmUserId);
        const row = await tx.program.create({
          data: {
            id: uuidv7(),
            code: body.code,
            nameBn: body.name.bn,
            nameEn: body.name.en,
            pmUserId: body.pmUserId ?? null,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
          select: SELECT,
        });
        await this.audit.record(tx, {
          action: 'program.create',
          entityType: 'program',
          entityId: row.id,
          new: { ...view(row) },
        });
        return { program: view(row), updatedAt: row.updatedAt };
      });
    } catch (error) {
      // two creations with one code at the same moment: the unique index decides
      if (isUniqueViolation(error)) throw new ApiError('program.code_taken', 409);
      throw error;
    }
  }

  /** Rename, deactivate or activate; deactivation waits until no project is draft, active or closing. */
  async update(
    actor: Principal,
    scope: Scope,
    programId: string,
    body: ProgramUpdate,
    ifMatch: string | undefined,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.find(tx, scope, programId, true);
      assertIfMatch(ifMatch, before.updatedAt);
      if (body.active === false && before.active) {
        const open = await tx.project.count({
          where: { programId, status: { in: OPEN_PROJECT_STATES } },
        });
        if (open) throw new ApiError('program.has_open_projects', 409);
      }
      const row = await tx.program.update({
        where: { id: programId },
        // Prisma leaves out the undefined fields
        data: {
          nameBn: body.name?.bn,
          nameEn: body.name?.en,
          active: body.active,
          updatedBy: actor.userId,
        },
        select: SELECT,
      });
      await this.audit.record(tx, {
        action: 'program.update',
        entityType: 'program',
        entityId: programId,
        old: { ...view(before) },
        new: { ...view(row) },
      });
      return { program: view(row), updatedAt: row.updatedAt };
    });
  }

  async assignPm(actor: Principal, scope: Scope, programId: string, pmUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.find(tx, scope, programId, true);
      // a deactivated program takes no new work, so it takes no new PM either
      if (!before.active) throw new ApiError('program.inactive', 409);
      await this.assertPm(tx, pmUserId);
      const row = await tx.program.update({
        where: { id: programId },
        data: { pmUserId, updatedBy: actor.userId },
        select: SELECT,
      });
      await this.audit.record(tx, {
        action: 'program.assign_pm',
        entityType: 'program',
        entityId: programId,
        old: { pmUserId: before.pmUserId },
        new: { pmUserId },
      });
      return { program: view(row), updatedAt: row.updatedAt };
    });
  }

  /** The program inside the caller's scope (404 outside), locked for a write when asked. */
  private async find(db: Tx, scope: Scope, programId: string, lock = false): Promise<Row> {
    if (lock) await db.$queryRaw`SELECT id FROM programs WHERE id = ${programId}::uuid FOR UPDATE`;
    const row = await db.program.findFirst({
      where: { AND: [{ id: programId }, programWhere(scope)] },
      select: SELECT,
    });
    if (!row) throw new ApiError('permission.not_found', 404);
    return row;
  }

  /** The PM of a program must be an active official holding the Program Manager role. */
  private async assertPm(db: Tx, userId: string): Promise<void> {
    const holds = await db.user.count({
      where: {
        id: userId,
        kind: 'staff',
        state: 'active',
        userRolesUser: { some: { roleKey: 'program_manager', revokedAt: null } },
      },
    });
    if (!holds) throw new ApiError('program.pm_role_required', 422);
  }
}
