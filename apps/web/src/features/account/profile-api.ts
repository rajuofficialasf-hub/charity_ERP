import {
  type EditField,
  type PhotoSlot,
  REQUEST_FIELD_LABEL,
  type StaffEditField,
} from '@css/shared/registration';
import type { OwnStaffProfile, ProjectsWork } from '@css/shared/auth';
import { api } from '../../api/client';

/** The own volunteer profile as GET /volunteers/me answers. */
export interface OwnProfile {
  userId: string;
  volunteerId: string | null;
  state: 'pending' | 'active' | 'blocked' | 'deactivated';
  displayName: string;
  mobile: string | null;
  email: string | null;
  inAnyProject: boolean;
  fatherName: string;
  motherName: string;
  nid: string;
  type: string;
  whatsapp: string | null;
  divisionId: string;
  districtId: string;
  upazilaId: string;
  unionId: string;
  addressLine: string | null;
  education: string | null;
  experience: string | null;
  workDescription: string | null;
  previousProjects: string | null;
  facebookId: string | null;
  bloodGroup: string | null;
  dateOfBirth: string | null;
  tshirtSize: string | null;
  volunteeringArea: string | null;
  profession: string | null;
  professionDetails: Record<string, unknown>;
  interestAreas: string[];
  vehicle: string | null;
  canSwim: boolean | null;
  availability: string | null;
  emergencyFullTime: boolean | null;
  educationDetails: Record<string, unknown>;
  permanentAddress: Record<string, unknown> | null;
  bank: {
    bankName?: string;
    accountName?: string;
    accountNumber?: string;
    branchName?: string;
    routingNumber?: string;
  };
  photoFileId: string | null;
  nidPhotoFileId: string | null;
  nidPhotoBackFileId: string | null;
}

export interface ChangeRequest {
  id: string;
  /** Null on an official's own request. */
  volunteerId: string | null;
  kind: 'registration_correction' | 'profile_edit';
  field: string;
  newValue?: unknown;
  note: string | null;
  status: 'open' | 'submitted' | 'approved' | 'rejected' | 'closed';
}

export const PROFILE_KEY = ['volunteers', 'me'] as const;
export const REQUESTS_KEY = ['me', 'change-requests'] as const;

export const ownProfile = () => api<OwnProfile>('/volunteers/me');
export const ownRequests = () => api<ChangeRequest[]>('/me/change-requests');

export const answerRequest = (id: string, newValue: unknown) =>
  api<ChangeRequest>(`/me/change-requests/${id}`, { method: 'PATCH', body: { newValue } });

export const resubmit = () => api<void>('/me/registration/resubmit', { method: 'POST' });

export const askEdit = (body: { field: string; newValue?: unknown; note?: string }) =>
  api<ChangeRequest>('/me/change-requests', { method: 'POST', body });

export const sendContactCode = (id: string) =>
  api<void>(`/me/change-requests/${id}/otp`, { method: 'POST' });

export const verifyContactCode = (id: string, code: string) =>
  api<void>(`/me/change-requests/${id}/otp/verify`, { method: 'POST', body: { code } });

export const uploadOwnPhoto = async (requestId: string, slot: PhotoSlot, photo: Blob) =>
  api<{ fileId: string }>(`/me/photos/${slot}?requestId=${requestId}&source=gallery`, {
    method: 'POST',
    rawBody: await photo.arrayBuffer(),
    headers: { 'Content-Type': photo.type },
  });

/** The catalogue label key of each field a request may name (registration namespace). */
export const FIELD_LABEL = REQUEST_FIELD_LABEL;
/** A field of a volunteer's request; an official's own fields are their profile's. */
export type RequestField = Exclude<
  keyof typeof FIELD_LABEL,
  Exclude<StaffEditField, EditField | PhotoSlot>
>;

/** An official's own profile and their projects with the figures of their work. */
export const STAFF_PROFILE_KEY = ['me', 'profile'] as const;
export const OWN_WORK_KEY = ['me', 'projects-work'] as const;
export const ownStaffProfile = () => api<OwnStaffProfile>('/me/profile');
export const ownProjectsWork = () => api<ProjectsWork>('/me/projects-work');
export const projectsWorkOf = (userId: string) =>
  api<ProjectsWork>(`/users/${userId}/projects-work`);

/** An official's own change request; the code routes are the official's own. */
export const askStaffEdit = (body: { field: string; newValue?: unknown; note?: string }) =>
  api<ChangeRequest>('/me/staff-change-requests', { method: 'POST', body });
export const sendStaffContactCode = (id: string) =>
  api<void>(`/me/staff-change-requests/${id}/otp`, { method: 'POST' });
export const verifyStaffContactCode = (id: string, code: string) =>
  api<void>(`/me/staff-change-requests/${id}/otp/verify`, { method: 'POST', body: { code } });

/** The programs an official may ask to move to. */
export interface StaffChoices {
  programs: { id: string; name: { bn: string; en: string } }[];
}
export const STAFF_CHOICES_KEY = ['me', 'staff-change-requests', 'choices'] as const;
export const staffChoices = () => api<StaffChoices>('/me/staff-change-requests/choices');
