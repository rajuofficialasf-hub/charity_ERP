import { api } from '../../api/client';
import type { ProgramCard, ProjectSeries, ProjectSeriesCard } from '../../api/schemas';
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

/**
 * The height of each kind of card, both faces alike (docs/ui/DESIGN_SYSTEM.md, "Card / Stat", the
 * flip card). A program card's back (its manager, its RPMs, two figures and the actions side by
 * side) fits in 380 px; its figures sit at the foot of the front, so the room a short name leaves
 * is under the name. A back that also carries the caller's work and a long description scrolls
 * inside the card.
 */
export const PROGRAM_CARD_HEIGHT = 380;
