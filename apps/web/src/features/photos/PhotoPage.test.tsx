import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiError, ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { loginPath, RequireAuth, returnPath } from '../../lib/auth';
import { PhotoPage } from './PhotoPage';

// The app's own address of a photo: the viewer on the photo, the way to its record, and the same
// "not found" for a photo the reader may not see as for one that does not exist.
const PHOTO = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4c01';
const APPLICATION = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4c60';

beforeEach(() => refreshAs(ME));

const open = () =>
  renderApp(<PhotoPage />, 'bn', { path: '/photos/:fileId', initialPath: `/photos/${PHOTO}` });

describe('the page of a photo', () => {
  it('opens the viewer on the photo and leads to its record', async () => {
    server.use(
      http.get(`*/api/v1/files/${PHOTO}/content`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer, {
          headers: { 'Content-Type': 'image/jpeg' },
        }),
      ),
      http.get(`*/api/v1/files/${PHOTO}`, () =>
        HttpResponse.json({
          data: {
            id: PHOTO,
            kind: 'distribution_proof',
            mime: 'image/jpeg',
            sizeBytes: 4,
            capturedAt: null,
            uploadedAt: '2026-11-02T05:00:00.000Z',
            virusScan: 'clean',
            flags: [],
            duplicateOf: null,
            width: null,
            height: null,
            uploadedBy: null,
            records: [{ entityType: 'application', entityId: APPLICATION }],
          },
          meta: {},
        }),
      ),
    );
    open();
    const viewer = await screen.findByRole('dialog', { name: 'ছবি' });
    expect(await within(viewer).findByRole('img', { name: 'ছবি' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'রেকর্ডে যান', hidden: true })).toHaveAttribute(
      'href',
      `/admin/applications/${APPLICATION}`,
    );
  });

  it('says the photo was not found to a reader the API refuses', async () => {
    server.use(
      http.get(`*/api/v1/files/${PHOTO}`, () => apiError(404, 'permission.not_found', 'not found')),
    );
    open();
    expect(
      await screen.findByText('ছবিটি পাওয়া যায়নি, অথবা এটি দেখার অনুমতি আপনার নেই।'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('the page of a photo that cannot be read', () => {
  it('says the photo could not be opened when the API fails otherwise', async () => {
    server.use(
      http.get(`*/api/v1/files/${PHOTO}`, () => apiError(403, 'permission.denied', 'refused')),
    );
    open();
    expect(
      await screen.findByText('ছবিটি এখন খোলা গেল না। একটু পরে আবার চেষ্টা করুন।'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks the API nothing for an address that names no file', async () => {
    renderApp(<PhotoPage />, 'bn', { path: '/photos/:fileId', initialPath: '/photos/..%2Fme' });
    expect(
      await screen.findByText('ছবিটি পাওয়া যায়নি, অথবা এটি দেখার অনুমতি আপনার নেই।'),
    ).toBeInTheDocument();
  });
});

describe('the return after signing in', () => {
  it('leads back to a page of the app itself and to nothing else', () => {
    expect(returnPath(`/photos/${PHOTO}`)).toBe(`/photos/${PHOTO}`);
    expect(returnPath('/admin/applications/0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4c02')).toBe(
      '/admin/applications/0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4c02',
    );
    expect(returnPath('/admin/users?page=2')).toBe('/admin/users?page=2');
    for (const next of [
      '//evil.example',
      '/\\evil.example',
      'https://evil.example',
      'javascript:alert(1)',
      `/photos/${PHOTO}/../../admin`,
      '/login?next=/admin',
      '/LOGIN',
      '/',
      '/a b',
      `\\\\evil.example/photos/${PHOTO}`,
      'x'.repeat(5),
      `/${'a'.repeat(1001)}`,
      null,
    ])
      expect(returnPath(next), String(next)).toBeNull();
  });

  it('sends a signed-out reader to the sign-in with the whole address of the page, its filters too', async () => {
    // no session from an earlier test: the reader is signed out
    resetClientForTests();
    refreshAs(null);
    const { router } = renderApp(<RequireAuth>{() => null}</RequireAuth>, 'bn', {
      path: '/admin/volunteers',
      initialPath: '/admin/volunteers?state=pending&page=2',
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'), { timeout: 5000 });
    expect(new URLSearchParams(router.state.location.search).get('next')).toBe(
      '/admin/volunteers?state=pending&page=2',
    );
  });

  it('names the page in the sign-in address only when it may return there', () => {
    expect(loginPath(undefined, `/photos/${PHOTO}`)).toBe(
      `/login?next=${encodeURIComponent(`/photos/${PHOTO}`)}`,
    );
    expect(loginPath('revoked', '/admin/users')).toBe(
      `/login?ended=revoked&next=${encodeURIComponent('/admin/users')}`,
    );
    // a logout of one's own keeps no page for whoever signs in next
    expect(loginPath('logout', '/admin/users')).toBe('/login?ended=logout');
    expect(loginPath()).toBe('/login');
  });
});
