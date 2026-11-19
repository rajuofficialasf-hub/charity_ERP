-- Reverses 20261119120000_admin_role (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The Main Admin gets the Department Head
-- role back (the row the migration ended, when it is still there) and loses the admin role, with
-- an audit entry and a new permission version; then the index goes. The role row stays for the
-- history that names it.
--
-- The reverse refuses two states it cannot undo without taking someone's access away or making a
-- second Head, and says what to do first:
--   another account holds the admin role (a second Admin, or the first one after the Main Admin
--   flag was handed on): give that person another role first;
--   the Main Admin would get the Head role back while someone else holds it: end that role first.
-- A Head role the migration ended as a second one is not given back: who should hold the role
-- then is a decision, not something this file can know.
DO $$
DECLARE
  other_admins integer;
  owner_was_head boolean;
  other_head boolean;
BEGIN
  SELECT count(*) INTO other_admins
  FROM user_roles r JOIN users u ON u.id = r.user_id
  WHERE r.role_key = 'admin' AND r.revoked_at IS NULL AND NOT u.is_system_owner;
  IF other_admins > 0 THEN
    RAISE EXCEPTION 'admin_role_down: % other account(s) hold the admin role; give them another role first', other_admins;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM user_roles r JOIN users u ON u.id = r.user_id
    WHERE u.is_system_owner AND r.role_key = 'department_head'
  ) INTO owner_was_head;
  SELECT EXISTS (
    SELECT 1 FROM user_roles r JOIN users u ON u.id = r.user_id
    WHERE r.role_key = 'department_head' AND r.revoked_at IS NULL AND NOT u.is_system_owner
  ) INTO other_head;
  IF owner_was_head AND other_head THEN
    RAISE EXCEPTION 'admin_role_down: the Main Admin would become a second Department Head; end the other Head role first';
  END IF;
END $$;

WITH owner AS (
  SELECT u.id FROM users u WHERE u.is_system_owner
),
ended AS (
  UPDATE user_roles r
  SET revoked_at = now(), revoked_by = r.user_id
  FROM owner o
  WHERE r.user_id = o.id AND r.role_key = 'admin' AND r.revoked_at IS NULL
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

DROP INDEX IF EXISTS "user_roles_one_department_head_key";
