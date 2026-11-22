import type { PermissionInfo } from '@css/shared/access';
import { api } from '../../api/client';

/** The permission catalogue with each permission's names (GET /permissions), shared by the panel's parts. */
export const PERMISSIONS_KEY = ['admin', 'permissions'] as const;
export const permissionCatalogue = () => api<PermissionInfo[]>('/permissions');
