-- Reverses 20261108120000_retire_implementer_role: gives back the grants and the project access the
-- migration ended, found by the ids its audit entries kept. The audit log is append-only, so those
-- entries stay and each restored user gets one more entry that records the reversal. Grants revoked
-- or access ended by anyone else stay as they are.

WITH entries AS (
  SELECT entity_id AS user_id, old
  FROM audit_log
  WHERE action = 'permission_change'
    AND reason = 'D-162: the Implementer role is retired; a Project Executive does the implementation work'
),
restored_roles AS (
  UPDATE user_roles
  SET revoked_at = NULL
  WHERE revoked_at IS NOT NULL
    AND id IN (
      SELECT jsonb_array_elements_text(e.old -> 'userRoleIds')::uuid
      FROM entries e
      WHERE jsonb_typeof(e.old -> 'userRoleIds') = 'array'
    )
  RETURNING id, user_id
),
restored_staff AS (
  UPDATE project_staff
  SET ended_at = NULL, updated_at = now()
  WHERE ended_at IS NOT NULL
    AND id IN (
      SELECT jsonb_array_elements_text(e.old -> 'projectStaffIds')::uuid
      FROM entries e
      WHERE jsonb_typeof(e.old -> 'projectStaffIds') = 'array'
    )
  RETURNING id, user_id
),
changed AS (
  SELECT user_id FROM restored_roles
  UNION
  SELECT user_id FROM restored_staff
),
bumped AS (
  UPDATE users
  SET permission_version = permission_version + 1
  WHERE id IN (SELECT user_id FROM changed)
  RETURNING id
)
INSERT INTO audit_log (id, created_at, action, entity_type, entity_id, old, new, reason)
SELECT
  gen_random_uuid(),
  now(),
  'permission_change',
  'user',
  c.user_id,
  jsonb_build_object('role', NULL),
  jsonb_build_object(
    'role', 'implementer',
    'userRoleIds', (SELECT jsonb_agg(r.id) FROM restored_roles r WHERE r.user_id = c.user_id),
    'projectStaffIds', (SELECT jsonb_agg(s.id) FROM restored_staff s WHERE s.user_id = c.user_id)
  ),
  'Reverted D-162: the Implementer role is given back by the down migration'
FROM changed c;
