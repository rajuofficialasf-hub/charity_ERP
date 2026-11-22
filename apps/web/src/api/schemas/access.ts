import {
  effectivePermissionSchema,
  permissionOverrideSchema,
  permissionSchema,
  roleHistoryRowSchema,
  roleSchema,
} from '@css/shared/access';
import { z } from 'zod';

/** The permission catalogue, the roles and one user's effective permissions, as shared. */
export {
  effectivePermissionSchema,
  permissionOverrideSchema,
  permissionSchema,
  roleHistoryRowSchema,
  roleSchema,
};

/** A user as the permission panel and the handover page find them (`GET /users`). */
export const panelUserSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  designation: z.string().nullable(),
  roles: z.array(z.string()),
});
export type PanelUser = z.infer<typeof panelUserSchema>;
export type { RoleHistoryRow } from '@css/shared/access';
