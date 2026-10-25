import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { expect } from 'vitest';
import type { Principal } from '../../../src/auth/principal';
import { mergedWorkflowDefinitions } from '../../../src/workflow/templates';
import type { AuthHarness, Session } from './auth-app';
import { beneficiary, insert, type locationTree } from './fixtures';

type Loc = Awaited<ReturnType<typeof locationTree>>;
import { publishedForm } from './forms';

/** The principal of a user as the access middleware would build it, for calls into a service. */
export async function principalOf(db: Client, userId: string): Promise<Principal> {
  const user = await db.query<{ kind: string; state: string }>(
    'SELECT kind, state FROM users WHERE id = $1',
    [userId],
  );
  const roles = await db.query<{ role_key: string; global_scope: boolean }>(
    `SELECT ur.role_key, r.global_scope FROM user_roles ur JOIN roles r ON r.key = ur.role_key WHERE ur.user_id = $1`,
    [userId],
  );
  return {
    userId,
    sessionId: randomUUID(),
    kind: user.rows[0]!.kind,
    state: user.rows[0]!.state,
    roles: roles.rows.map((r) => r.role_key),
    globalScope: roles.rows.some((r) => r.global_scope),
    isSystemOwner: false,
    permissionVersion: 1,
  };
}

/**
 * A project that takes applications: the form placed from a ready form by `builder`, the window
 * open around today, a per-volunteer limit, the state active and the merged template of its
 * workflow as the snapshot activation would take (the state is set directly; activation itself
 * is proven by the lifecycle tests).
 */
export async function applicationProject(
  h: AuthHarness,
  builder: Session,
  projectId: string,
  options: { limit?: number; workflow?: string; window?: [string, string] } = {},
) {
  const form = await publishedForm(h, builder, projectId);
  const key = options.workflow ?? 'distribution';
  const snapshot = mergedWorkflowDefinitions().find((d) => d.template === key);
  expect(snapshot, `the template ${key}`).toBeDefined();
  const [from, to] = options.window ?? ['2026-01-01', '2099-12-31'];
  await h.db.query(
    `UPDATE projects SET status = 'active', apply_from = $2, apply_to = $3, per_volunteer_limit = $4,
            workflow_snapshot = $5, activated_at = now() WHERE id = $1`,
    [projectId, from, to, options.limit ?? 50, JSON.stringify(snapshot)],
  );
  return form;
}

/** The answers of the fixture's placed form (`support/forms.ts`), as stored rows. */
export const IDENTITY_ANSWERS = (nid: string, mobile: string, loc: Loc) => ({
  q_id: { t: 'short_text', v: nid },
  q_name: { t: 'short_text', v: 'নমুনা আবেদনকারী' },
  q_father: { t: 'short_text', v: 'নমুনা পিতা' },
  q_mobile: { t: 'phone', v: mobile },
  q_gender: { t: 'single_select', v: 'male' },
  q_address: {
    t: 'bd_address',
    division_id: loc.division,
    district_id: loc.district,
    upazila_id: loc.upazila,
    union_id: loc.union,
  },
  q_village: { t: 'short_text', v: 'নমুনা গ্রাম' },
});

/**
 * An application row with its answers, written directly: the engine's tests need applications in
 * every state before the application service exists.
 */
export async function applicationRow(
  db: Client,
  input: {
    projectId: string;
    versionId: string;
    loc: Loc;
    status?: string;
    ownerVolunteerId?: string | null;
    createdByUserId?: string | null;
    beneficiaryId?: string | null;
    submittedBy?: string | null;
    answers?: Record<string, unknown>;
    over?: Record<string, unknown>;
  },
): Promise<string> {
  // every application but a public entry has its person from the start (the identity comes first)
  const beneficiaryId =
    input.beneficiaryId ??
    (input.status === 'needs_verification' ? null : await beneficiary(db, input.loc));
  const id = await insert(db, 'applications', {
    id: randomUUID(),
    project_id: input.projectId,
    form_version_id: input.versionId,
    beneficiary_id: beneficiaryId,
    owner_volunteer_id: input.ownerVolunteerId ?? null,
    created_by_user_id: input.createdByUserId ?? null,
    created_by: input.createdByUserId ?? null,
    submitted_by: input.submittedBy ?? null,
    status: input.status ?? 'draft',
    region_location_id: input.loc.division,
    district_id: input.loc.district,
    union_id: input.loc.union,
    ...(input.over ?? {}),
  });
  const fields = await db.query<{ id: string; field_key: string }>(
    'SELECT id, field_key FROM form_fields WHERE form_version_id = $1',
    [input.versionId],
  );
  const byKey = new Map(fields.rows.map((f) => [f.field_key, f.id]));
  for (const [key, value] of Object.entries(input.answers ?? {})) {
    const fieldId = byKey.get(key);
    expect(fieldId, `the field ${key}`).toBeDefined();
    await insert(db, 'application_answers', {
      id: randomUUID(),
      application_id: id,
      field_id: fieldId,
      repeat_index: 0,
      value: JSON.stringify(value),
    });
  }
  return id;
}

export async function statusOf(db: Client, applicationId: string): Promise<string> {
  const { rows } = await db.query<{ status: string }>(
    'SELECT status FROM applications WHERE id = $1',
    [applicationId],
  );
  return rows[0]!.status;
}
