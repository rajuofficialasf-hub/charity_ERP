import type { OwnStaffProfile } from '@css/shared/auth';
import type { Principal } from '../auth/principal.js';
import type { PrismaService } from '../core/prisma.service.js';
import { ApiError } from '../i18n/api-error.js';
import { staffPhotos } from './staff-photos.js';

/**
 * An official's own profile: who they are, where they work and how they are reached. It reads the
 * caller's own record only; a volunteer's own profile is `GET /volunteers/me`.
 */
export class OwnProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async read(principal: Principal): Promise<OwnStaffProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: principal.userId },
      select: {
        id: true,
        kind: true,
        displayName: true,
        jobId: true,
        designation: true,
        affiliation: true,
        affiliationUnit: true,
        homeProgramId: true,
        supervisorUserId: true,
        mobile: true,
        email: true,
        state: true,
        lastLoginAt: true,
        userRolesUser: {
          where: { revokedAt: null },
          select: { role: { select: { key: true, nameBn: true, nameEn: true } } },
          orderBy: { roleKey: 'asc' },
        },
      },
    });
    if (!user || user.kind !== 'staff') throw new ApiError('permission.not_found', 404);
    const [program, supervisor, photos] = await Promise.all([
      user.homeProgramId
        ? this.prisma.program.findUnique({
            where: { id: user.homeProgramId },
            select: { id: true, nameBn: true, nameEn: true },
          })
        : null,
      user.supervisorUserId
        ? this.prisma.user.findUnique({
            where: { id: user.supervisorUserId },
            select: { id: true, displayName: true },
          })
        : null,
      staffPhotos(this.prisma, [user.id]),
    ]);
    return {
      id: user.id,
      displayName: user.displayName,
      jobId: user.jobId,
      designation: user.designation,
      roles: user.userRolesUser.map(({ role }) => ({
        key: role.key,
        name: { bn: role.nameBn, en: role.nameEn },
      })),
      affiliation: user.affiliation as OwnStaffProfile['affiliation'],
      affiliationUnit: user.affiliationUnit,
      program: program
        ? { id: program.id, name: { bn: program.nameBn, en: program.nameEn } }
        : null,
      supervisor: supervisor ? { id: supervisor.id, name: supervisor.displayName } : null,
      mobile: user.mobile,
      email: user.email,
      state: user.state as OwnStaffProfile['state'],
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      photoFileId: photos.get(user.id) ?? null,
    };
  }
}
