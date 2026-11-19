import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { loadAccessRegistry } from '../../../src/access/registry.js';
import { locationTree, project, user, volunteer, volunteerUser } from './fixtures.js';

/** Roles and permissions of permissions.yaml, as the base seed writes them (`seed/sets/base/access.ts`). */
export async function seedAccessCatalogue(db: Client): Promise<void> {
  const registry = loadAccessRegistry();
  for (const role of registry.roles.values())
    await db.query(
      `INSERT INTO roles (key, name_bn, name_en, kind, global_scope) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (key) DO NOTHING`,
      [role.key, role.nameBn, role.nameEn, role.kind, role.globalScope],
    );
  for (const p of registry.permissions.values())
    await db.query(
      `INSERT INTO permissions (name, module, sensitive, description) VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO NOTHING`,
      [p.name, p.module, p.sensitive, p.description],
    );
}

export async function grantRole(db: Client, userId: string, role: string): Promise<void> {
  await db.query(
    `INSERT INTO user_roles (id, user_id, role_key, granted_by) VALUES ($1, $2, $3, $2)`,
    [randomUUID(), userId, role],
  );
}

async function defaultStaff(db: Client, role: string): Promise<string> {
  const id = await user(db);
  await grantRole(db, id, role);
  return id;
}

/**
 * Two divisions (Dhaka-like and Rangpur-like), program P with projects A1 and A2 and another
 * program with project B1; a PM of P, an RPM per division on A1, a Project Executive under the
 * Dhaka RPM with the "if RPM grants" extra `application.approve`, a দাঈ-স্বেচ্ছাসেবক (both) on A1
 * (application_distribution) and A2 (application_distribution_dawah), a Local দায়ী on A1 with
 * `exam.record`, a team
 * member, the Department Head and the Monitoring Team.
 */
/** How the world creates its accounts (the API tests pass makers whose accounts can log in). */
export interface AccountMakers {
  staff: (role: string) => Promise<string>;
  volunteerUser: (role: string) => Promise<string>;
}

export async function accessWorld(db: Client, makers: Partial<AccountMakers> = {}) {
  await seedAccessCatalogue(db);
  const staffUser = makers.staff ?? ((role: string) => defaultStaff(db, role));
  const volunteerAccount =
    makers.volunteerUser ??
    (async (role: string) => {
      const id = await volunteerUser(db);
      await grantRole(db, id, role);
      return id;
    });
  const dhaka = await locationTree(db);
  const rangpur = await locationTree(db);
  const a1 = await project(db);
  const a2 = await project(db, { program_id: a1.program });
  const b1 = await project(db);

  const admin = await staffUser('admin');
  const head = await staffUser('department_head');
  const monitoring = await staffUser('monitoring_team');
  const pm = await staffUser('program_manager');
  await db.query('UPDATE programs SET pm_user_id = $1 WHERE id = $2', [pm, a1.program]);
  const rpmDhaka = await staffUser('regional_program_manager');
  const rpmRangpur = await staffUser('regional_program_manager');
  for (const [rpm, division] of [
    [rpmDhaka, dhaka.division],
    [rpmRangpur, rangpur.division],
  ] as const)
    await db.query(
      `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
      [randomUUID(), a1.id, division, rpm],
    );
  const executive = await staffUser('project_executive');
  await db.query(
    `INSERT INTO project_staff (id, project_id, user_id, role_key, area_location_id, extra_permissions, granted_by)
     VALUES ($1, $2, $3, 'project_executive', $4, $5, $6)`,
    [randomUUID(), a1.id, executive, dhaka.division, ['application.approve'], rpmDhaka],
  );

  const assign = async (
    volunteerId: string,
    projectId: string,
    set: string,
    region: string,
    extras: string[] = [],
  ) =>
    db.query(
      `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, extra_permissions, assigned_by, consent_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'accepted')`,
      [randomUUID(), projectId, volunteerId, region, set, extras, rpmDhaka],
    );
  const generalUser = await volunteerAccount('volunteer_both');
  const general = await volunteer(db, dhaka, generalUser, { type: 'both' });
  await assign(general, a1.id, 'application_distribution', dhaka.division);
  await assign(general, a2.id, 'application_distribution_dawah', dhaka.division);
  const daeeUser = await volunteerAccount('volunteer_local_daee');
  const daee = await volunteer(db, dhaka, daeeUser, { type: 'local_daee' });
  await assign(daee, a1.id, 'application_distribution_dawah', dhaka.division, ['exam.record']);
  const teamUser = await volunteerAccount('volunteer_team_member');
  // a volunteer of the Rangpur region on A1, and a staff member only on B1 (another program)
  const rangpurUser = await volunteerAccount('volunteer_general');
  const rangpurVolunteer = await volunteer(db, rangpur, rangpurUser);
  await assign(rangpurVolunteer, a1.id, 'application_distribution', rangpur.division);
  const outsider = await staffUser('project_executive');
  await db.query(
    `INSERT INTO project_staff (id, project_id, user_id, role_key, granted_by)
     VALUES ($1, $2, $3, 'project_executive', $3)`,
    [randomUUID(), b1.id, outsider],
  );

  return {
    dhaka,
    rangpur,
    a1,
    a2,
    b1,
    users: {
      admin,
      head,
      monitoring,
      pm,
      rpmDhaka,
      rpmRangpur,
      executive,
      general: generalUser,
      daee: daeeUser,
      team: teamUser,
      rangpurVolunteer: rangpurUser,
      outsider,
    },
  };
}
