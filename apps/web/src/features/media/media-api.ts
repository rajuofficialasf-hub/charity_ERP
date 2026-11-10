import type { MediaScript } from '@css/shared';
import type { ContentType, MediaPriority, PublicationState, ScriptState } from '@css/shared/media';
import { api } from '../../api/client';
import type {
  MediaCounts,
  MediaEvent,
  MediaListItem,
  MediaMember,
  MediaPerson,
  MediaPublication,
  MediaReferral,
  MediaSummary,
  MediaTeamMember,
  MediaWork,
  MediaWorkPage,
  MediaWorkRow,
  PublishedWork,
} from '../../api/schemas';

export type {
  MediaCounts,
  MediaEvent,
  MediaListItem,
  MediaMember,
  MediaPerson,
  MediaPublication,
  MediaReferral,
  MediaSummary,
  MediaTeamMember,
  MediaWork,
  MediaWorkRow,
  PublishedWork,
};

export type MediaList = 'media_stage' | 'media_role' | 'media_platform';
export const mediaListKey = (list: MediaList) => ['reference-lists', list] as const;
export const mediaList = (list: MediaList) => api<MediaListItem[]>(`/reference-lists/${list}`);

export const MEDIA_KEY = ['media'] as const;
export const referralKey = (id: string) => ['media', 'referral', id] as const;

export const mediaSummary = () => api<MediaSummary>('/media/summary');

export const mediaWorks = (query: string) =>
  api<MediaWorkPage>(`/media-works?${query}`, { envelope: true });

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

/** The whole team, with the version the caller last read. */
export const setMembers = (
  workId: string,
  version: string,
  members: { userId: string; roles: string[] }[],
) =>
  api<MediaReferral>(`/media-works/${workId}/members`, {
    method: 'PUT',
    body: { members },
    headers: { 'If-Match': version },
  });

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
  body: {
    state?: PublicationState;
    publishedOn?: string;
    link?: string | null;
    note?: string | null;
  },
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

export const mediaTeam = () => api<MediaTeamMember[]>('/media/members');
