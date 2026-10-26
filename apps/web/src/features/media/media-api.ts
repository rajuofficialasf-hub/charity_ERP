import type { MediaScript } from '@css/shared';
import type { Bilingual } from '@css/shared/i18n';
import type {
  ContentType,
  MediaPriority,
  PublicationState,
  ReferralState,
  ScriptState,
} from '@css/shared/media';
import type { ReferenceItem } from '../../admin/settings/settings-api';
import { api } from '../../lib/api';

export interface MediaPerson {
  id: string;
  name: string;
}

interface Place {
  program: { id: string; name: Bilingual };
  project: { id: string; name: Bilingual; year: number };
}

/** A published or done work, as a profile and a portfolio show it. */
export interface PublishedWork extends Place {
  referralId: string;
  workId: string;
  title: string;
  stageCode: string;
  contentType: ContentType;
  summary: string | null;
  publishedOn: string | null;
  publications: {
    platformCode: string;
    link: string;
    publishedOn: string | null;
    youtubeId: string | null;
  }[];
  members: { userId: string; name: string; roles: string[] }[];
}

export interface MediaCounts {
  referrals: number;
  new: number;
  inReview: number;
  inProgress: number;
  waitingForShooting: number;
  inEditing: number;
  published: number;
  done: number;
  rejected: number;
}

export interface MediaSummary {
  overall: MediaCounts;
  programs: { program: { id: string; name: Bilingual }; counts: MediaCounts }[];
}

/** A row of the works list: a referral, with its work once accepted. */
export interface MediaWorkRow extends Place {
  referralId: string;
  workId: string | null;
  title: string | null;
  beneficiaryName: string;
  members: { userId: string; name: string }[];
  state: ReferralState;
  stageCode: string | null;
  priority: MediaPriority;
  referredAt: string;
  updatedAt: string;
}

export interface MediaPublication {
  id: string;
  platformCode: string;
  state: PublicationState;
  publishedOn: string | null;
  link: string | null;
  note: string | null;
  youtubeId: string | null;
}

export interface MediaWork {
  id: string;
  title: string;
  stageCode: string;
  heldStageCode: string | null;
  contentType: ContentType;
  script: MediaScript | null;
  scriptState: ScriptState;
  reviewApprovedBy: MediaPerson | null;
  reviewApprovedAt: string | null;
  version: string;
  members: { userId: string; name: string; roles: string[] }[];
  publications: MediaPublication[];
  comments: { id: string; author: MediaPerson; body: string; at: string }[];
  nextStages: string[];
  mayManage: boolean;
  mayEditScript: boolean;
  mayDirect: boolean;
  mayReview: boolean;
}

export interface MediaEvent {
  id: string;
  kind: string;
  fromValue: string | null;
  toValue: string | null;
  comment: string | null;
  actor: MediaPerson;
  at: string;
}

export interface MediaReferral extends Place {
  id: string;
  applicationId: string;
  appNo: string | null;
  state: ReferralState;
  priority: MediaPriority;
  beneficiaryName: string;
  referredBy: MediaPerson;
  referredAt: string;
  decidedAt: string | null;
  note: string;
  story: string | null;
  decidedBy: MediaPerson | null;
  decisionComment: string | null;
  beneficiary: {
    name: string;
    fatherOrHusbandName: string;
    ageYears: number | null;
    mobile: string;
    address: {
      divisionId: string;
      districtId: string;
      upazilaId: string;
      unionId: string;
      village: string;
      postOffice: string | null;
    };
    occupation: Bilingual | null;
    monthlyIncome: string | null;
  };
  officialComment: string | null;
  work: MediaWork | null;
  history: MediaEvent[];
  mayDecide: boolean;
  mayResend: boolean;
}

export interface MediaMember {
  id: string;
  name: string;
  designation: string | null;
  mobile: string | null;
  email: string | null;
  roles: string[];
  counts: { works: number; published: number };
  portfolio: (PublishedWork & { ownRoles: string[] })[];
}

/** An item of one of the media reference lists (stages, production roles, platforms). */
export type MediaListItem = ReferenceItem;

interface Page<T> {
  data: T[];
  meta: { nextCursor?: string | null };
}

export type MediaList = 'media_stage' | 'media_role' | 'media_platform';
export const mediaListKey = (list: MediaList) => ['reference-lists', list] as const;
export const mediaList = (list: MediaList) => api<MediaListItem[]>(`/reference-lists/${list}`);

export const MEDIA_KEY = ['media'] as const;
export const referralKey = (id: string) => ['media', 'referral', id] as const;

export const mediaSummary = () => api<MediaSummary>('/media/summary');

export const mediaWorks = (query: string) =>
  api<Page<MediaWorkRow>>(`/media-works?${query}`, { envelope: true });

export const mediaReferral = (id: string) => api<MediaReferral>(`/media-referrals/${id}`);

export const mediaMember = (userId: string) => api<MediaMember>(`/media/members/${userId}`);

export const referToMedia = (
  applicationId: string,
  body: { priority: MediaPriority; note: string; story?: string },
) =>
  api<MediaReferral>(`/applications/${applicationId}/media-referral`, {
    method: 'POST',
    body,
  });

export const decideReferral = (
  referralId: string,
  body: { decision: 'accept' | 'send_back' | 'reject'; comment?: string },
) => api<MediaReferral>(`/media-referrals/${referralId}/decision`, { method: 'POST', body });

/** A change to the work, with the version the caller last read. */
export const updateWork = (
  workId: string,
  version: string,
  body: {
    title?: string;
    stageCode?: string;
    contentType?: ContentType;
    script?: MediaScript;
    scriptState?: ScriptState;
  },
) =>
  api<MediaReferral>(`/media-works/${workId}`, {
    method: 'PATCH',
    body,
    headers: { 'If-Match': version },
  });

export const setMembers = (workId: string, members: { userId: string; roles: string[] }[]) =>
  api<MediaReferral>(`/media-works/${workId}/members`, { method: 'PUT', body: { members } });

export const addPublication = (
  workId: string,
  body: {
    platformCode: string;
    state: PublicationState;
    publishedOn?: string;
    link?: string;
    note?: string;
  },
) => api<MediaReferral>(`/media-works/${workId}/publications`, { method: 'POST', body });

export const updatePublication = (
  publicationId: string,
  body: { state?: PublicationState; publishedOn?: string; link?: string; note?: string },
) => api<MediaReferral>(`/media-publications/${publicationId}`, { method: 'PATCH', body });

export const reviewWork = (
  workId: string,
  version: string,
  body: { decision: 'approve' | 'send_back'; comment?: string },
) =>
  api<MediaReferral>(`/media-works/${workId}/final-review`, {
    method: 'POST',
    body,
    headers: { 'If-Match': version },
  });

export const commentOnWork = (workId: string, body: string) =>
  api<MediaReferral>(`/media-works/${workId}/comments`, { method: 'POST', body: { body } });

/** A member of the Media Team, for the team editor. */
export interface MediaTeamMember {
  id: string;
  name: string;
  designation: string | null;
  roles: string[];
}
export const mediaTeam = () => api<MediaTeamMember[]>('/media/members');
