import type { UploadRecordType } from '@css/shared/files';
import { Prisma } from '../generated/prisma/client';
import { WORKING_ASSIGNMENT } from '../access/effective';
import { projectWhere, type Scope } from '../access/scope';
import type { Tx } from '../core/prisma.service';

/** What an upload needs of the record a file links to. */
export interface UploadRecord {
  projectId: string;
  programId: string;
  projectCode: string;
  programCode: string;
  projectStatus: string;
  year: number;
  /** The application the record belongs to, which photo keys are grouped under. */
  applicationId: string | null;
  /** The users whose own record this is (SELF): the volunteer owner, the creator, the raiser. */
  owners: string[];
  /** The places of the record (division, district, upazila, union); empty for a project-wide one. */
  locations: string[];
  districtCode: string | null;
  /** The device time the record was made, where the record keeps one (an application). */
  clientCreatedAt: Date | null;
}

interface Row {
  project_id: string;
  application_id: string | null;
  owners: string[];
  locations: string[];
  district_code: string | null;
  client_created_at: Date | null;
}

/** The places of an application: its region, district and union, and the union's upazila. */
const APPLICATION_PLACES = Prisma.sql`
  array_remove(ARRAY[a.region_location_id, a.district_id, a.union_id, u.parent_id], NULL)`;
const APPLICATION_JOIN = Prisma.sql`
  LEFT JOIN applications a ON a.id = t.application_id AND a.deleted_at IS NULL
  LEFT JOIN locations u ON u.id = a.union_id`;

/** One query per record type: its project, the people it belongs to and its places. */
function recordQuery(type: UploadRecordType, id: string): Prisma.Sql {
  switch (type) {
    case 'application':
      return Prisma.sql`
        SELECT a.project_id, a.id AS application_id,
               -- the creator is an owner only while the owner is their team lead there (or
               -- nobody owns it), as the application scope's creator rule says
               array_remove(ARRAY[v.user_id,
                 CASE WHEN a.owner_volunteer_id IS NULL OR EXISTS (
                   SELECT 1 FROM volunteer_teams vt
                     JOIN volunteers m ON m.id = vt.member_volunteer_id
                    WHERE vt.project_id = a.project_id
                      AND vt.lead_volunteer_id = a.owner_volunteer_id
                      AND vt.removed_at IS NULL AND m.user_id = a.created_by_user_id)
                 THEN a.created_by_user_id END], NULL) AS owners,
               ${APPLICATION_PLACES} AS locations, NULL::text AS district_code,
               a.client_created_at
          FROM applications a
          LEFT JOIN volunteers v ON v.id = a.owner_volunteer_id
          LEFT JOIN locations u ON u.id = a.union_id
         WHERE a.id = ${id}::uuid AND a.deleted_at IS NULL`;
    case 'activity':
      return Prisma.sql`
        SELECT t.project_id, t.application_id, array_remove(ARRAY[t.created_by], NULL) AS owners,
               coalesce(${APPLICATION_PLACES}, '{}') AS locations, NULL::text AS district_code,
               NULL::timestamptz AS client_created_at
          FROM activities t ${APPLICATION_JOIN}
         WHERE t.id = ${id}::uuid`;
    case 'issue':
      return Prisma.sql`
        SELECT t.project_id, t.application_id, ARRAY[t.raised_by] AS owners,
               coalesce(${APPLICATION_PLACES}, '{}') AS locations, NULL::text AS district_code,
               NULL::timestamptz AS client_created_at
          FROM issues t ${APPLICATION_JOIN}
         WHERE t.id = ${id}::uuid`;
    case 'voucher':
      return Prisma.sql`
        SELECT t.project_id, t.application_id, ARRAY[t.submitted_by] AS owners,
               coalesce(${APPLICATION_PLACES}, '{}') AS locations, NULL::text AS district_code,
               NULL::timestamptz AS client_created_at
          FROM vouchers t ${APPLICATION_JOIN}
         WHERE t.id = ${id}::uuid`;
    case 'payment':
      return Prisma.sql`
        SELECT t.project_id, t.application_id, array_remove(ARRAY[t.created_by], NULL) AS owners,
               coalesce(${APPLICATION_PLACES}, '{}') AS locations, NULL::text AS district_code,
               NULL::timestamptz AS client_created_at
          FROM payments t ${APPLICATION_JOIN}
         WHERE t.id = ${id}::uuid`;
    case 'expense_claim':
      // a claim is placed in the region of its volunteer's assignment on the project
      return Prisma.sql`
        SELECT c.project_id, NULL::uuid AS application_id, ARRAY[v.user_id] AS owners,
               array_remove(ARRAY[pv.region_location_id], NULL) AS locations,
               NULL::text AS district_code,
               NULL::timestamptz AS client_created_at
          FROM expense_claims c
          JOIN volunteers v ON v.id = c.volunteer_id
          LEFT JOIN project_volunteers pv
            ON pv.project_id = c.project_id AND pv.volunteer_id = c.volunteer_id AND pv.ended_at IS NULL
         WHERE c.id = ${id}::uuid`;
    case 'animal':
      return Prisma.sql`
        SELECT n.project_id, NULL::uuid AS application_id,
               array_remove(ARRAY[v.user_id], NULL) AS owners, '{}'::uuid[] AS locations,
               NULL::text AS district_code,
               NULL::timestamptz AS client_created_at
          FROM animals n
          LEFT JOIN volunteers v ON v.id = n.assigned_volunteer_id
         WHERE n.id = ${id}::uuid`;
    case 'document':
      return Prisma.sql`
        SELECT d.project_id, NULL::uuid AS application_id,
               array_remove(ARRAY[d.created_by], NULL) AS owners,
               array_remove(ARRAY[d.district_id, l.parent_id], NULL) AS locations,
               l.code AS district_code, NULL::timestamptz AS client_created_at
          FROM documents d
          LEFT JOIN locations l ON l.id = d.district_id
         WHERE d.id = ${id}::uuid`;
  }
}

/** The record a file is to link to, or null when it does not exist. */
export async function loadUploadRecord(
  db: Tx,
  type: UploadRecordType,
  id: string,
): Promise<UploadRecord | null> {
  const [row] = await db.$queryRaw<Row[]>(recordQuery(type, id));
  if (!row) return null;
  const project = await db.project.findUnique({
    where: { id: row.project_id },
    select: {
      code: true,
      year: true,
      status: true,
      programId: true,
      program: { select: { code: true } },
    },
  });
  if (!project) return null;
  return {
    projectId: row.project_id,
    programId: project.programId,
    projectCode: project.code,
    programCode: project.program.code,
    projectStatus: project.status,
    year: project.year,
    applicationId: row.application_id,
    owners: row.owners,
    locations: row.locations,
    districtCode: row.district_code,
    clientCreatedAt: row.client_created_at,
  };
}

/**
 * Whether the caller's upload scope reaches the record (docs/security/RBAC.md, "Object-level checks for ASSIGNED and SELF"): a global,
 * program or project grant reaches every record of the project; an area grant reaches the records
 * of its place, and project-wide records; a SELF grant reaches the caller's own records on a
 * project the caller works on (an accepted assignment or a staff place). ASSIGNED reaches nothing
 * until the work assignments exist.
 */
export async function scopeReachesRecord(
  db: Tx,
  scope: Scope,
  record: UploadRecord,
): Promise<boolean> {
  const i = scope.instances;
  // a revoked project is out of reach whichever grant would reach it
  if (i.revokedProjectIds.includes(record.projectId)) return false;
  if (
    i.global ||
    i.programIds.includes(record.programId) ||
    i.projectIds.includes(record.projectId)
  )
    return true;
  if (i.areas.length) {
    const inProject = await db.project.count({
      where: { AND: [{ id: record.projectId }, projectWhere(scope)] },
    });
    if (
      inProject > 0 &&
      (record.locations.length === 0 ||
        i.areas.some(
          (a) =>
            (a.projectId === null || a.projectId === record.projectId) &&
            record.locations.includes(a.locationId),
        ))
    )
      return true;
  }
  if (!i.self || !record.owners.includes(scope.actorId)) return false;
  const [assignment, staff] = await Promise.all([
    db.projectVolunteer.count({
      where: {
        ...WORKING_ASSIGNMENT,
        projectId: record.projectId,
        volunteer: { userId: scope.actorId },
      },
    }),
    db.projectStaff.count({
      where: { projectId: record.projectId, userId: scope.actorId, endedAt: null },
    }),
  ]);
  return assignment + staff > 0;
}
