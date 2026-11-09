-- Data only: DECISION_LOG D-162: the Implementer role is retired. A Project Executive does the implementation
-- work (every permission of the role is also the Project Executive's, in a wider scope). The active
-- grants of the role are revoked and the project access given through it ends, each with an audit
-- entry on the user and a new permission version, so a signed-in session reloads its access. The
-- role row stays: the revoked grants, the ended access and the audit history name it.

WITH revoked AS (
  UPDATE user_roles
  SET revoked_at = now()
  WHERE role_key = 'implementer' AND revoked_at IS NULL
  RETURNING id, user_id
),
ended AS (
  UPDATE project_staff
  SET ended_at = now(), updated_at = now()
  WHERE role_key = 'implementer' AND ended_at IS NULL
  RETURNING id, user_id, project_id
),
changed AS (
  SELECT user_id FROM revoked
  UNION
  SELECT user_id FROM ended
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
  jsonb_build_object(
    'role', 'implementer',
    'userRoleIds', (SELECT jsonb_agg(r.id) FROM revoked r WHERE r.user_id = c.user_id),
    'projectStaffIds', (SELECT jsonb_agg(e.id) FROM ended e WHERE e.user_id = c.user_id)
  ),
  jsonb_build_object('role', NULL),
  'D-162: the Implementer role is retired; a Project Executive does the implementation work'
FROM changed c;
