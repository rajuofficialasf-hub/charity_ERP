-- Reverses 20261119120000_admin_role (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The index goes; the Main Admin gets the
-- Department Head role back (the row the migration ended, when it is still there) and loses the
-- admin role, with an audit entry and a new permission version. Any other account given the admin
-- role since keeps its row, ended, so the role row can stay for the history that names it. A
-- database with another live Department Head must end that role first: the Main Admin's would be
-- a second one.
DROP INDEX IF EXISTS "user_roles_one_department_head_key";

WITH owner AS (
  SELECT u.id FROM users u WHERE u.is_system_owner
),
ended AS (
  UPDATE user_roles r
  SET revoked_at = now(), revoked_by = r.user_id
  WHERE r.role_key = 'admin' AND r.revoked_at IS NULL
  RETURNING r.id, r.user_id
),
restored AS (
  UPDATE user_roles r
  SET revoked_at = NULL, revoked_by = NULL
  FROM owner o
  WHERE r.user_id = o.id
    AND r.role_key = 'department_head'
    AND r.id = (
      SELECT x.id FROM user_roles x
      WHERE x.user_id = o.id AND x.role_key = 'department_head'
      ORDER BY x.revoked_at DESC NULLS FIRST
      LIMIT 1
    )
  RETURNING r.id, r.user_id
),
bumped AS (
  UPDATE users u
  SET permission_version = u.permission_version + 1
  WHERE u.id IN (SELECT user_id FROM ended)
  RETURNING u.id
)
INSERT INTO audit_log (id, created_at, action, entity_type, entity_id, old, new, reason)
SELECT
  gen_random_uuid(),
  now(),
  'user.role_changed',
  'user',
  e.user_id,
  jsonb_build_object('roles', jsonb_build_array('admin'), 'userRoleId', e.id),
  jsonb_build_object(
    'roles', coalesce((SELECT jsonb_agg('department_head'::text) FROM restored r WHERE r.user_id = e.user_id), '[]'::jsonb)
  ),
  'Reverted: the admin role migration'
FROM ended e;
