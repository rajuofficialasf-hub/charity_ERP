import type { Principal } from '../auth/principal';
import type { PrismaService } from '../core/prisma.service';
import { ApiError } from '../i18n/api-error';
import { DETAILS_SELECT, detailsView } from './volunteer-details';

/**
 * Volunteer profiles (BR-026, BR-031). So far the own profile: the volunteer sees their own NID,
 * NID photo id and bank details in full (DECISION_LOG D-081), never their rating or category.
 */
export class VolunteersService {
  constructor(private readonly prisma: PrismaService) {}

  async own(principal: Principal) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: principal.userId },
      select: {
        id: true,
        state: true,
        displayName: true,
        mobile: true,
        email: true,
        volunteersUser: {
          select: {
            id: true,
            nid: true,
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
            bankName: true,
            bankAccountName: true,
            bankAccountNumber: true,
            bankBranchName: true,
            bankRoutingNumber: true,
            referenceNid: true,
            photoFileId: true,
            nidPhotoFileId: true,
            nidPhotoBackFileId: true,
            _count: { select: { projectVolunteersVolunteer: { where: { endedAt: null } } } },
          },
        },
      },
    });
    const v = user.volunteersUser;
    if (!v) throw new ApiError('permission.not_found', 404);
    return {
      userId: user.id,
      volunteerId: v.id,
      state: user.state,
      displayName: user.displayName,
      mobile: user.mobile,
      email: user.email,
      inAnyProject: v._count.projectVolunteersVolunteer > 0,
      fatherName: v.fatherName,
      motherName: v.motherName,
      nid: v.nid,
      type: v.type,
      whatsapp: v.whatsapp,
      divisionId: v.divisionId,
      districtId: v.districtId,
      upazilaId: v.upazilaId,
      unionId: v.unionId,
      addressLine: v.addressLine,
      education: v.education,
      experience: v.experience,
      workDescription: v.workDescription,
      previousProjects: v.previousProjects,
      facebookId: v.facebookId,
      ...detailsView(v),
      bank: compact({
        bankName: v.bankName,
        accountName: v.bankAccountName,
        accountNumber: v.bankAccountNumber,
        branchName: v.bankBranchName,
        routingNumber: v.bankRoutingNumber,
      }),
      referenceNid: v.referenceNid,
      photoFileId: v.photoFileId,
      nidPhotoFileId: v.nidPhotoFileId,
      nidPhotoBackFileId: v.nidPhotoBackFileId,
    };
  }
}

/** The bank details without their empty fields (the contract's BankDetails has no nulls). */
export function compact(bank: Record<string, string | null>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(bank).filter((e): e is [string, string] => e[1] !== null),
  );
}
