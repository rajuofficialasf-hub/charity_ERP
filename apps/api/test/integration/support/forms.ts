import { expect } from 'vitest';
import type { AuthHarness, Session } from './auth-app';
import { bearer } from './auth-app';
import request from 'supertest';

/**
 * A project's form from a library template, published through the API: what a project needs
 * before it can be activated, and what a template or a copy carries along.
 */
export async function publishedForm(
  h: AuthHarness,
  session: Session,
  projectId: string,
  templateKey = 'form_distribution',
): Promise<{ formId: string; versionId: string }> {
  const api = () => request(h.server());
  const made = await api()
    .post(`/api/v1/projects/${projectId}/forms`)
    .set(bearer(session))
    .send({
      key: 'default',
      title: { bn: 'আবেদন', en: 'Application' },
      source: { kind: 'template', templateKey },
    });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const versionId = made.body.data.draftVersionId as string;
  const read = await api().get(`/api/v1/form-versions/${versionId}`).set(bearer(session));
  expect(read.status).toBe(200);
  const published = await api()
    .post(`/api/v1/form-versions/${versionId}/publish`)
    .set(bearer(session))
    .set('If-Match', read.headers.etag as string);
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  return { formId: made.body.data.id as string, versionId };
}
