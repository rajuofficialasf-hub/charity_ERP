import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { loadAccessRegistry } from '../../../src/access/registry';
import { locationTree, project, user, volunteer, volunteerUser } from './fixtures';

/** Roles and permissions of permissions.yaml, as the base seed writes them (T1.3). */
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

async function staffUser(db: Client, role: string): Promise<string> {
  const id = await user(db);
  await grantRole(db, id, role);
  return id;
}

/**
 * Two divisions (Dhaka-like and Rangpur-like), program P with projects A1 and A2 and another
 * program with project B1; a PM of P, an RPM per division on A1, a Project Executive under the
 * Dhaka RPM with the "if RPM grants" extra `application.approve`, a general volunteer on A1
 * (application_distribution) and A2 (work_progress), a Local দায়ী on A1 with `exam.record`, a team
 * member, the Department Head and the Monitoring Team.
 */
export async function accessWorld(db: Client) {
  await seedAccessCatalogue(db);
  const dhaka = await locationTree(db);
  const rangpur = await locationTree(db);
  const a1 = await project(db);
  const a2 = await project(db, { program_id: a1.program });
  const b1 = await project(db);

  const head = await staffUser(db, 'department_head');
  const monitoring = await staffUser(db, 'monitoring_team');
  const pm = await staffUser(db, 'program_manager');
  await db.query('UPDATE programs SET pm_user_id = $1 WHERE id = $2', [pm, a1.program]);
  const rpmDhaka = await staffUser(db, 'regional_program_manager');
  const rpmRangpur = await staffUser(db, 'regional_program_manager');
  for (const [rpm, division] of [
    [rpmDhaka, dhaka.division],
    [rpmRangpur, rangpur.division],
  ] as const)
    await db.query(
      `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
      [randomUUID(), a1.id, division, rpm],
    );
  const executive = await staffUser(db, 'project_executive');
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
      `INSERT INTO project_volunteers (id, project_id, volunteer_id, region_location_id, permission_set, extra_permissions, assigned_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), projectId, volunteerId, region, set, extras, rpmDhaka],
    );
  const generalUser = await volunteerUser(db);
  await grantRole(db, generalUser, 'volunteer_general');
  const general = await volunteer(db, dhaka, generalUser);
  await assign(general, a1.id, 'application_distribution', dhaka.division);
  await assign(general, a2.id, 'work_progress', dhaka.division);
  const daeeUser = await volunteerUser(db);
  await grantRole(db, daeeUser, 'volunteer_local_daee');
  const daee = await volunteer(db, dhaka, daeeUser, { type: 'local_daee' });
  await assign(daee, a1.id, 'application_distribution_dawah', dhaka.division, ['exam.record']);
  const teamUser = await volunteerUser(db);
  await grantRole(db, teamUser, 'volunteer_team_member');

  return {
    dhaka,
    rangpur,
    a1,
    a2,
    b1,
    users: {
      head,
      monitoring,
      pm,
      rpmDhaka,
      rpmRangpur,
      executive,
      general: generalUser,
      daee: daeeUser,
      team: teamUser,
    },
  };
}
