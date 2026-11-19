-- The Admin role (docs/security/RBAC.md, "Roles"; docs/architecture/AUTH.md, "Main Admin
-- protection"): an Admin maintains the system and appoints the Department Head, and the Main Admin
-- is an Admin account. The role row is written here so the step below can name it; the catalogue
-- sync keeps its names as it keeps every role's. The account that holds the system owner flag held
-- the Department Head role until now: that role ends and the admin role starts, with an audit
-- entry and a new permission version, so a signed-in session reloads its access.
INSERT INTO "roles" ("key", "name_bn", "name_en", "kind", "global_scope")
VALUES ('admin', 'অ্যাডমিন', 'Admin', 'official', true)
ON CONFLICT ("key") DO NOTHING;

WITH owner AS (
  SELECT u.id
  FROM users u
  WHERE u.is_system_owner
    AND NOT EXISTS (
      SELECT 1 FROM user_roles r
      WHERE r.user_id = u.id AND r.role_key = 'admin' AND r.revoked_at IS NULL
    )
),
ended AS (
  UPDATE user_roles r
  SET revoked_at = now(), revoked_by = r.user_id
  FROM owner o
  WHERE r.user_id = o.id AND r.revoked_at IS NULL
  RETURNING r.id, r.user_id, r.role_key
),
given AS (
  INSERT INTO user_roles (id, user_id, role_key, granted_by)
  SELECT gen_random_uuid(), o.id, 'admin', o.id FROM owner o
  RETURNING id, user_id
),
bumped AS (
  UPDATE users u
  SET permission_version = u.permission_version + 1
  FROM owner o
  WHERE u.id = o.id
  RETURNING u.id
)
INSERT INTO audit_log (id, created_at, action, entity_type, entity_id, old, new, reason)
SELECT
  gen_random_uuid(),
  now(),
  'user.role_changed',
  'user',
  g.user_id,
  jsonb_build_object(
    'roles', (SELECT jsonb_agg(e.role_key ORDER BY e.role_key) FROM ended e WHERE e.user_id = g.user_id),
    'userRoleIds', (SELECT jsonb_agg(e.id) FROM ended e WHERE e.user_id = g.user_id)
  ),
  jsonb_build_object('roles', jsonb_build_array('admin'), 'userRoleId', g.id),
  'The Main Admin is an Admin account (the admin role migration)'
FROM given g;

-- One official holds the Department Head role at a time: a second live row is refused, so two
-- appointments made at the same moment cannot both land.
CREATE UNIQUE INDEX "user_roles_one_department_head_key" ON "user_roles" ("role_key")
  WHERE role_key = 'department_head' AND revoked_at IS NULL;
