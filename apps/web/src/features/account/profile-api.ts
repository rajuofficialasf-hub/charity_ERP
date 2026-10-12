import type { PhotoSlot } from '@css/shared/registration';
import { api } from '../../lib/api';

/** The own volunteer profile as GET /volunteers/me answers (DECISION_LOG D-081). */
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
  bank: { bankName?: string; accountName?: string; accountNumber?: string; routingNumber?: string };
  photoFileId: string | null;
  nidPhotoFileId: string | null;
}

export interface ChangeRequest {
  id: string;
  volunteerId: string;
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
export const FIELD_LABEL = {
  name: 'form.name',
  fatherName: 'form.father_name',
  motherName: 'form.mother_name',
  nid: 'form.nid',
  whatsapp: 'form.whatsapp',
  address: 'form.address',
  addressLine: 'form.address_line',
  education: 'form.education',
  experience: 'form.experience',
  workDescription: 'form.work_description',
  previousProjects: 'form.previous_projects',
  facebookId: 'form.facebook',
  bank: 'form.bank',
  photo: 'form.photo',
  nid_photo: 'form.nid_photo',
  mobile: 'start.mobile',
  email: 'start.email',
} as const;
export type RequestField = keyof typeof FIELD_LABEL;
