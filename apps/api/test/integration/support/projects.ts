import request from 'supertest';
import { type AuthHarness, bearer, type Session } from './auth-app.js';

/** What the setup's first step asks for a new project: its series and its first session. */
export interface NewProject {
  programId: string;
  code: string;
  name: { bn: string; en: string };
  /** The session runs the whole of this year (2026 when left out) unless the months are given. */
  year?: number;
  periodFrom?: string;
  periodTo?: string;
  source: Record<string, unknown>;
}

/**
 * A draft made through the API as the setup makes one: the project series, then its first session.
 * Answers the response of the session's creation, or the series' refusal when the series was not
 * created (a program outside the caller's reach, a code already taken).
 */
export async function draftProject(h: AuthHarness, s: Session, project: NewProject) {
  const api = request(h.server());
  const series = await api
    .post('/api/v1/project-series')
    .set(bearer(s))
    .send({ programId: project.programId, code: project.code, name: project.name });
  if (series.status !== 201) return series;
  const year = project.year ?? 2026;
  return api
    .post('/api/v1/projects')
    .set(bearer(s))
    .send({
      seriesId: series.body.data.id as string,
      periodFrom: project.periodFrom ?? `${year}-01`,
      periodTo: project.periodTo ?? `${year}-12`,
      source: project.source,
    });
}
