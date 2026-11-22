import { AuditWriter } from '../../../src/audit/audit-writer.js';
import { createInvitation, invitationLink } from '../../../src/services/staff-accounts.js';
import { SEED_AT, type SeedContext, seedId } from '../../context.js';
import { hash } from '@node-rs/argon2';
import { ARGON2, DEMO_PASSWORD, DEMO_PROGRAMS } from '../demo/index.js';
import type { StaffListRow } from './staff-file.js';
import type { VolunteerListRow } from './volunteer-file.js';
import { defaultVolunteerHome, seedOrgVolunteers, type VolunteerHome } from './volunteers.js';

/**
 * The org set: the department's own officials from a checked staff list (`staff-file.ts`), in
 * place of the demo accounts in the development database. Each official is a pending account
 * without a password, with the role, designation, home program and supervisor the list gives; the
 * programs are the demo set's three, each with the PM the list names; the list's first Admin is the
 * Main Admin where the database has none. Every official still pending gets a set-password link,
 * handed to `writeLinks` inside the transaction, so a link nobody holds is never left behind.
 */

/** One set-password link as it is handed over: nothing about the person beyond job ID and name. */
export interface OrgLink {
  jobId: string;
  name: string;
  roleKey: string;
  link: string;
  expiresAt: string;
}

export interface OrgOptions {
  appOrigin: string;
  now: Date;
  writeLinks: (links: OrgLink[]) => void | Promise<void>;
  /**
   * Opens every official still without a password with the demo set's password instead of a link,
   * so the owner can sign in as any of them on the development database; a password of one's own
   * stays.
   */
  demoPassword?: boolean;
  /** The department's own volunteers from a checked volunteer list (`volunteer-file.ts`). */
  volunteers?: VolunteerListRow[];
  /** Where the volunteers live until their own address is entered; Savar, Dhaka when left out. */
  volunteerHome?: VolunteerHome;
}

const userId = (jobId: string) => seedId(`org-user:${jobId}`);
const programId = (code: string) => seedId(`program:${code}`);

export async function seedOrg(ctx: SeedContext, rows: StaffListRow[], options: OrgOptions) {
  const audit = new AuditWriter();
  const demoHash = options.demoPassword ? await hash(DEMO_PASSWORD, ARGON2) : null;
  // the links and the rows are written by the system actor, which the base set makes first
  const actor = ctx.actorId;
  if (!actor) throw new Error('the org set runs after the base set, which makes the system actor');
  await ctx.transaction(async () => {
    const demo = await ctx.db.setting.count({ where: { key: 'seed.marker.demo' } });
    if (demo)
      throw new Error(
        'this database holds the demo set; reset it before loading the department’s own officials',
      );

    // new accounts first, bare, so that programs and supervisors can point at them
    const existing = new Set(
      (
        await ctx.db.user.findMany({
          where: { id: { in: rows.map((r) => userId(r.jobId)) } },
          select: { id: true },
        })
      ).map((u) => u.id),
    );
    const hasOwner = (await ctx.db.user.count({ where: { isSystemOwner: true } })) > 0;
    const firstAdmin = rows.find((r) => r.roleKey === 'admin')?.jobId;
    for (const r of rows) {
      if (existing.has(userId(r.jobId))) continue;
      await ctx.db.user.create({
        data: {
          id: userId(r.jobId),
          kind: 'staff',
          state: 'pending',
          email: r.email,
          mobile: r.mobile,
          displayName: r.name,
          designation: r.designation,
          jobId: r.jobId,
          affiliation: 'department',
          language: 'bn',
          // written when the account is made, never after: the flag moves by the owner transfer alone
          isSystemOwner: !hasOwner && r.jobId === firstAdmin,
          createdBy: actor,
          updatedBy: actor,
        },
      });
    }

    for (const p of DEMO_PROGRAMS) {
      const pm = rows.find((r) => r.roleKey === 'program_manager' && r.programCode === p.code);
      await ctx.upsert('programs', {
        id: programId(p.code),
        code: p.code,
        name_bn: p.name_bn,
        name_en: p.name_en,
        pm_user_id: pm ? userId(pm.jobId) : null,
        active: true,
        ...ctx.audit(),
      });
    }

    for (const r of rows) {
      await ctx.upsert(
        'users',
        {
          id: userId(r.jobId),
          kind: 'staff',
          email: r.email,
          mobile: r.mobile,
          display_name: r.name,
          designation: r.designation,
          job_id: r.jobId,
          affiliation: 'department',
          home_program_id: r.programCode ? programId(r.programCode) : null,
          supervisor_user_id: r.supervisorJobId ? userId(r.supervisorJobId) : null,
          ...ctx.audit(),
        },
        { insertOnly: ['state', 'password_hash', 'is_system_owner', 'language'] },
      );
      await ctx.upsert('user_roles', {
        id: seedId(`user-role:${userId(r.jobId)}:${r.roleKey}`),
        user_id: userId(r.jobId),
        role_key: r.roleKey,
        granted_by: actor,
        granted_at: SEED_AT,
      });
    }

    // a link for everyone who has not set a password yet; an earlier run's open link is revoked
    const pending = new Set(
      (
        await ctx.db.user.findMany({
          where: {
            id: { in: rows.map((r) => userId(r.jobId)) },
            state: 'pending',
            passwordHash: null,
          },
          select: { id: true },
        })
      ).map((u) => u.id),
    );
    const links: OrgLink[] = [];
    if (demoHash) {
      const ids = [...pending];
      await ctx.db.accountInvitation.updateMany({
        where: { userId: { in: ids }, usedAt: null, revokedAt: null },
        data: { revokedAt: options.now },
      });
      await ctx.db.user.updateMany({
        where: { id: { in: ids } },
        data: { state: 'active', passwordHash: demoHash, updatedBy: actor },
      });
      pending.clear();
    }
    for (const r of rows) {
      if (!pending.has(userId(r.jobId))) continue;
      const issued = await createInvitation(ctx.db, audit, {
        userId: userId(r.jobId),
        createdBy: actor,
        now: options.now,
        reissued: false,
      });
      links.push({
        jobId: r.jobId,
        name: r.name,
        roleKey: r.roleKey,
        link: invitationLink(options.appOrigin, issued.token),
        expiresAt: issued.expiresAt.toISOString(),
      });
    }
    const volunteers = options.volunteers ?? [];
    if (volunteers.length)
      await seedOrgVolunteers(ctx, volunteers, {
        actor,
        home: options.volunteerHome ?? (await defaultVolunteerHome(ctx.db)),
        demoHash,
      });
    await options.writeLinks(links);
  });
}
