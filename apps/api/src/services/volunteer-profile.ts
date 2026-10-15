import type { AccessService } from '../access/service';
import { type Scope, volunteerWhere } from '../access/scope';
import type { Principal } from '../auth/principal';
import { boundedRead } from '../core/bounded-read';
import type { PrismaService } from '../core/prisma.service';
import { ApiError } from '../i18n/api-error';
import { CORRECTION, UNFINISHED } from './registrations';
import { DETAILS_SELECT, detailsView } from './volunteer-details';
import { compact } from './volunteers';

/**
 * What an official may do to the volunteer, as the action routes decide it: each permission with
 * the entity of its route. The profile shows a button only for a true flag.
 */
const ACTIONS = {
  approve: { permission: 'registration.approve', entity: 'volunteer' },
  requestCorrection: { permission: 'registration.request_correction', entity: 'volunteer' },
  block: { permission: 'volunteer.block', entity: 'volunteer' },
  unblock: { permission: 'volunteer.unblock', entity: 'volunteer' },
  sessions: { permission: 'session.revoke_user', entity: 'user' },
} as const;

/** The most team members and ratings a profile carries. */
const MAX_TEAM = 200;
const MAX_RATINGS = 100;

const PROFILE_SELECT = {
  id: true,
  userId: true,
  type: true,
  fatherName: true,
  motherName: true,
  whatsapp: true,
  divisionId: true,
  districtId: true,
  upazilaId: true,
  unionId: true,
  addressLine: true,
  education: true,
  experience: true,
  workDescription: true,
  previousProjects: true,
  facebookId: true,
  ...DETAILS_SELECT,
  nid: true,
  nidPhotoFileId: true,
  nidPhotoBackFileId: true,
  bankName: true,
  bankAccountName: true,
  bankAccountNumber: true,
  bankBranchName: true,
  bankRoutingNumber: true,
  photoFileId: true,
  category: true,
  inactiveFlag: true,
  approvedAt: true,
  user: {
    select: { displayName: true, state: true, mobile: true, email: true, createdAt: true },
  },
  projectVolunteersVolunteer: {
    where: { endedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      permissionSet: true,
      isPaid: true,
      regionLocationId: true,
      createdAt: true,
      project: { select: { id: true, code: true, nameBn: true, nameEn: true, year: true } },
    },
  },
  volunteerRatingsVolunteer: {
    where: { finalizedAt: { not: null } },
    orderBy: { finalizedAt: 'desc' },
    take: MAX_RATINGS,
    select: { projectId: true, workKind: true, finalScores: true, finalizedAt: true },
  },
  // a correction still open or not yet resubmitted blocks the approval and a new correction
  volunteerChangeRequestsVolunteer: {
    where: { kind: CORRECTION, status: { in: UNFINISHED } },
    select: { id: true },
    take: 1,
  },
} as const;

/**
 * The official's view of one volunteer (the volunteer profile screen; DECISION_LOG O-67, D-094): everything the tab
 * holds about the person, read-only. The identity fields and the bank details are sent only when
 * the caller's `volunteer.view_sensitive` scope reaches this volunteer; the field mask then removes
 * every class the caller does not see. The flags say which actions the caller may take here.
 */
export class VolunteerProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async profile(principal: Principal, scope: Scope, volunteerId: string) {
    const [access, found] = await Promise.all([
      this.access.load(principal.userId),
      boundedRead(this.prisma, async (tx) => {
        const v = await tx.volunteer.findFirst({
          where: { AND: [{ id: volunteerId }, volunteerWhere(scope)] },
          select: {
            ...PROFILE_SELECT,
            // the team: the members who registered with this volunteer as their reference, as far
            // as the caller's scope reaches
            volunteersReferenceVolunteer: {
              where: volunteerWhere(scope),
              orderBy: { createdAt: 'asc' },
              take: MAX_TEAM,
              select: {
                id: true,
                type: true,
                user: { select: { displayName: true, state: true } },
              },
            },
          },
        });
        if (!v) return null;
        const block = await tx.blocklist.findFirst({
          where: { subjectType: 'volunteer', subjectId: v.id, active: true },
          select: { reason: true, blockedAt: true },
        });
        return { v, block };
      }),
    ]);
    if (!found) {
      this.access.denied(principal.userId, scope.permission, scope.entity);
      throw new ApiError('permission.not_found', 404);
    }
    const { v, block } = found;
    // the user id comes from the loaded row, so every flag is decided about this one person
    const target = { volunteerId: v.id, userId: v.userId };
    const sensitive = await this.access.sensitiveScope(
      principal,
      access,
      'volunteer.view_sensitive',
      'volunteer',
    );
    const seesIdentity = !!sensitive && (await this.access.reaches(sensitive, target));
    // keyed lookups of the caller's own grants and of this one record, outside the time limit
    const allowed = await this.access.allowedOn(principal, access, ACTIONS, target);
    const pending = v.user.state === 'pending';
    const correcting = v.volunteerChangeRequestsVolunteer.length > 0;
    const details = detailsView(v);
    return {
      id: v.id,
      userId: v.userId,
      displayName: v.user.displayName,
      type: v.type,
      state: v.user.state,
      mobile: v.user.mobile,
      email: v.user.email,
      whatsapp: v.whatsapp,
      fatherName: v.fatherName,
      motherName: v.motherName,
      divisionId: v.divisionId,
      districtId: v.districtId,
      upazilaId: v.upazilaId,
      unionId: v.unionId,
      addressLine: v.addressLine,
      facebookId: v.facebookId,
      education: v.education,
      experience: v.experience,
      workDescription: v.workDescription,
      previousProjects: v.previousProjects,
      ...details,
      // outside the sensitive scope the identity and bank fields are not sent at all
      ...(seesIdentity
        ? {
            nid: v.nid,
            nidPhotoFileId: v.nidPhotoFileId,
            nidPhotoBackFileId: v.nidPhotoBackFileId,
            bank: compact({
              bankName: v.bankName,
              accountName: v.bankAccountName,
              accountNumber: v.bankAccountNumber,
              branchName: v.bankBranchName,
              routingNumber: v.bankRoutingNumber,
            }),
          }
        : { bloodGroup: undefined, dateOfBirth: undefined }),
      photoFileId: v.photoFileId,
      registeredAt: v.user.createdAt.toISOString(),
      approvedAt: v.approvedAt?.toISOString() ?? null,
      projects: v.projectVolunteersVolunteer.map((a) => ({
        ...a.project,
        permissionSet: a.permissionSet,
        isPaid: a.isPaid,
        regionLocationId: a.regionLocationId,
        assignedAt: a.createdAt.toISOString(),
      })),
      team: v.volunteersReferenceVolunteer.map((m) => ({
        id: m.id,
        displayName: m.user.displayName,
        type: m.type,
        state: m.user.state,
      })),
      category: v.category,
      inactiveFlag: v.inactiveFlag,
      ratings: v.volunteerRatingsVolunteer.map((r) => ({
        projectId: r.projectId,
        workKind: r.workKind,
        finalScores: r.finalScores,
        finalizedAt: r.finalizedAt!.toISOString(),
      })),
      blocklist: block
        ? { blocked: true, blockedAt: block.blockedAt.toISOString(), reason: block.reason }
        : { blocked: false },
      actions: {
        // the caller decides on this pending registration, though a correction may hold it now
        review: (allowed.approve || allowed.requestCorrection) && pending,
        // as the approve route: a pending registration, not blocklisted, with no correction pending
        approve: allowed.approve && pending && !block && !correcting,
        requestCorrection: allowed.requestCorrection && pending && !correcting,
        block: allowed.block && !block && v.user.state !== 'blocked',
        unblock: allowed.unblock && !!block,
        viewSessions: allowed.sessions,
        revokeSessions: allowed.sessions,
      },
    };
  }
}
