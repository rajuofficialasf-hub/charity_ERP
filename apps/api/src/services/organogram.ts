import type { Scope } from '../access/scope.js';
import type { AccessService } from '../access/service.js';
import { type PrismaService } from '../core/prisma.service.js';
import { staffPhotos } from './staff-photos.js';

/** One official in the organogram with the officials who report to them inside the same part. */
export interface OrganogramNode {
  userId: string;
  displayName: string;
  jobId: string | null;
  designation: string | null;
  roles: string[];
  state: string;
  homeDivisionId: string | null;
  /** The official's uploaded photo; null shows the initial. */
  photoFileId: string | null;
  reports: OrganogramNode[];
}

export interface Organogram {
  /** The officials of a global role (Department Head, Monitoring Team). */
  leadership: OrganogramNode[];
  programs: {
    programId: string;
    code: string;
    name: { bn: string; en: string };
    active: boolean;
    members: OrganogramNode[];
  }[];
  /** Department staff without a home program, not a PM and without a supervisor line to one. */
  unplaced: OrganogramNode[];
}

/** The order of officials under one another: the PM first, then the RPMs, then field staff. */
const ROLE_RANK = new Map<string, number>([
  ['department_head', 0],
  ['monitoring_team', 1],
  ['program_manager', 2],
  ['media_director', 2],
  ['regional_program_manager', 3],
  ['media_assistant_director', 3],
  ['project_executive', 4],
  ['official_daee', 5],
]);
const rank = (roles: string[]) => Math.min(99, ...roles.map((r) => ROLE_RANK.get(r) ?? 99));

interface Official {
  id: string;
  displayName: string;
  jobId: string | null;
  designation: string | null;
  state: string;
  homeProgramId: string | null;
  homeDivisionId: string | null;
  supervisorUserId: string | null;
  roles: string[];
  global: boolean;
}

/**
 * The organogram of the department, computed from roles, the home
 * program, the supervisor and the programs' PMs; never drawn by hand. Only the department's own
 * staff appear, never another department of the Foundation or an outside partner, and never a
 * deactivated official. A program holds its PM, the officials whose home program it is, and those
 * whose supervisor line reaches its PM; inside a program an official sits under their supervisor
 * when the supervisor belongs to the same program. The caller sees the officials of their scope.
 */
export class OrganogramService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async build(scope: Scope): Promise<Organogram> {
    const department = { kind: 'staff', affiliation: 'department', state: { not: 'deactivated' } };
    const [rows, visibleRows, programs] = await Promise.all([
      this.prisma.user.findMany({
        where: department,
        select: {
          id: true,
          displayName: true,
          jobId: true,
          designation: true,
          state: true,
          homeProgramId: true,
          homeDivisionId: true,
          supervisorUserId: true,
          userRolesUser: {
            where: { revokedAt: null },
            select: { roleKey: true, role: { select: { globalScope: true } } },
          },
        },
      }),
      this.prisma.user.findMany({
        where: { AND: [this.access.userFilter(scope), department] },
        select: { id: true },
      }),
      this.prisma.program.findMany({
        orderBy: { code: 'asc' },
        select: { id: true, code: true, nameBn: true, nameEn: true, pmUserId: true, active: true },
      }),
    ]);
    const officials = new Map<string, Official>(
      rows.map(({ userRolesUser, ...u }) => [
        u.id,
        {
          ...u,
          roles: userRolesUser.map((r) => r.roleKey).sort(),
          global: userRolesUser.some((r) => r.role.globalScope),
        },
      ]),
    );
    const visible = new Set(visibleRows.map((r) => r.id));
    const photos = await staffPhotos(this.prisma, [...visible]);
    const pmProgram = new Map<string, string>();
    for (const p of programs)
      if (p.pmUserId && !pmProgram.has(p.pmUserId)) pmProgram.set(p.pmUserId, p.id);

    // the program of each official; a line that loops or leaves the department places nobody
    const placed = new Map<string, string | null>();
    const programOf = (id: string, seen = new Set<string>()): string | null => {
      if (placed.has(id)) return placed.get(id)!;
      const o = officials.get(id);
      if (!o || o.global || seen.has(id)) return null;
      seen.add(id);
      const program =
        o.homeProgramId ??
        pmProgram.get(id) ??
        (o.supervisorUserId ? programOf(o.supervisorUserId, seen) : null);
      placed.set(id, program);
      return program;
    };

    const node = (o: Official, children: Map<string, Official[]>): OrganogramNode => ({
      userId: o.id,
      displayName: o.displayName,
      jobId: o.jobId,
      designation: o.designation,
      roles: o.roles,
      state: o.state,
      homeDivisionId: o.homeDivisionId,
      photoFileId: photos.get(o.id) ?? null,
      reports: sorted(children.get(o.id) ?? []).map((c) => node(c, children)),
    });
    const sorted = (list: Official[]) =>
      [...list].sort(
        (a, b) => rank(a.roles) - rank(b.roles) || a.displayName.localeCompare(b.displayName, 'bn'),
      );
    const flat = (list: Official[]) => sorted(list).map((o) => node(o, new Map()));

    const seen = [...officials.values()].filter((o) => visible.has(o.id));
    const byProgram = new Map<string, Official[]>();
    const unplaced: Official[] = [];
    for (const o of seen) {
      if (o.global) continue;
      const program = programOf(o.id);
      if (program) byProgram.set(program, [...(byProgram.get(program) ?? []), o]);
      else unplaced.push(o);
    }
    return {
      leadership: flat(seen.filter((o) => o.global)),
      programs: programs
        .filter((p) => byProgram.has(p.id) || (scope.instances.global && p.active))
        .map((p) => {
          const members = byProgram.get(p.id) ?? [];
          const ids = new Set(members.map((m) => m.id));
          const byId = new Map(members.map((m) => [m.id, m]));
          // a supervisor line that comes back to an official (never written, but never lost
          // either): such an official stands at the top instead of disappearing
          const inLoop = (m: Official) => {
            let next = m.supervisorUserId;
            for (let step = 0; next && step <= members.length; step += 1) {
              if (next === m.id) return true;
              next = byId.get(next)?.supervisorUserId ?? null;
            }
            return false;
          };
          const children = new Map<string, Official[]>();
          const roots: Official[] = [];
          for (const m of members) {
            const parent = m.supervisorUserId;
            if (parent && ids.has(parent) && !inLoop(m))
              children.set(parent, [...(children.get(parent) ?? []), m]);
            else roots.push(m);
          }
          return {
            programId: p.id,
            code: p.code,
            name: { bn: p.nameBn, en: p.nameEn },
            active: p.active,
            members: sorted(roots).map((r) => node(r, children)),
          };
        }),
      unplaced: flat(unplaced),
    };
  }
}
