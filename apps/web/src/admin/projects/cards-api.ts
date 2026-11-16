import { api } from '../../api/client';
import type { ProjectSeriesCreate, ProjectSeriesUpdate, SessionCreate } from '@css/shared/projects';
import type {
  ProgramCard,
  Project,
  ProjectSeries,
  ProjectSeriesCard,
  ProjectSeriesRecord,
} from '../../api/schemas';
import { listQuery } from '../list-query';
import { PROJECTS_KEY } from './projects-api';

export type { ProgramCard, ProjectSeries, ProjectSeriesCard };

/**
 * The cards of the programs and projects tab (docs/ui/SCREENS.md, "Project list and project
 * page"): every program and every project series with counts, read by everyone who holds the
 * overview of programs and projects. The cards live under the projects' key, so every write that
 * refreshes the projects (a new session, a move of its lifecycle, a transfer) refreshes their
 * counts too.
 */
export const CARDS_KEY = [...PROJECTS_KEY, 'cards'] as const;

/** GET /program-cards: every program as a card (not paginated). */
export const programCards = () => api<ProgramCard[]>('/program-cards');

/** GET /project-series: the project series as cards, of one program or of all (not paginated). */
export const seriesCards = (programId?: string) =>
  api<ProjectSeriesCard[]>(`/project-series${listQuery({ programId })}`);

/** GET /project-series/{seriesId}: one project series with its program and its sessions. */
export const seriesDetail = (seriesId: string) => api<ProjectSeries>(`/project-series/${seriesId}`);

/** The series with its version, for the If-Match of its edit. */
export const seriesWithEtag = (seriesId: string) =>
  api<ProjectSeriesRecord>(`/project-series/${seriesId}`, { envelope: true });

/** POST /project-series: a new project series of a program, without a session yet. */
export const createSeries = (body: ProjectSeriesCreate) =>
  api<ProjectSeries>('/project-series', { method: 'POST', body });

/** PATCH /project-series/{seriesId}: its names or its description, with its version. */
export const updateSeries = (seriesId: string, etag: string, body: ProjectSeriesUpdate) =>
  api<ProjectSeries>(`/project-series/${seriesId}`, {
    method: 'PATCH',
    body,
    headers: { 'If-Match': etag },
  });

/**
 * POST /project-series/{seriesId}/sessions: a draft session copied from one of the series'
 * sessions, under an idempotency key, so a request sent twice makes one session.
 */
export const startSession = (seriesId: string, body: SessionCreate, key: string) =>
  api<Project>(`/project-series/${seriesId}/sessions`, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': key },
  });

/** PUT /programs/{programId}/cover: a finished cover upload becomes the program's cover. */
export const setProgramCover = (programId: string, fileId: string) =>
  api<{ fileId: string }>(`/programs/${programId}/cover`, { method: 'PUT', body: { fileId } });

/** PUT /project-series/{seriesId}/cover: a finished cover upload becomes the project's cover. */
export const setSeriesCover = (seriesId: string, fileId: string) =>
  api<{ fileId: string }>(`/project-series/${seriesId}/cover`, {
    method: 'PUT',
    body: { fileId },
  });

/**
 * The height of each kind of card, both faces alike (docs/ui/DESIGN_SYSTEM.md, "Card / Stat", the
 * flip card). A program card's back (its manager, its RPMs, two figures and the actions side by
 * side) fits in 380 px; its figures sit at the foot of the front, so the room a short name leaves
 * is under the name. A back that also carries the caller's work and a long description scrolls
 * inside the card.
 */
export const PROGRAM_CARD_HEIGHT = 380;

/**
 * A project card's height: its back holds the current session's RPMs, four figures, the caller's
 * own work and two actions side by side where they fit; its front the approved bar and three
 * figures at its foot. Measured on the demo data: the back needs 326 px of the 346 px it has on a
 * computer; on a 360 px phone the fullest back (the own work with the budget and both actions,
 * stacked) needs 374 px and scrolls inside the card; the front's foot needs 118 to 136 px.
 */
export const SERIES_CARD_HEIGHT = 440;
