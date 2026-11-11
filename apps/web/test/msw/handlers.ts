import { http, HttpResponse } from 'msw';

/**
 * Default request handlers for component tests. Real handlers are typed from docs/api/openapi.yaml
 * as screens are built (docs/testing/TEST_STRATEGY.md, "Pyramid and tools"); this sample proves the
 * wiring.
 */
export const PUBLIC_SETTINGS = {
  defaultLanguage: 'bn',
  organisation: {
    foundationName: { bn: 'আস-সুন্নাহ ফাউন্ডেশন', en: 'As-Sunnah Foundation' },
    departmentName: {
      bn: 'চ্যারিটি এন্ড সোশ্যাল সার্ভিস ডিপার্টমেন্ট',
      en: 'Charity & Social Service Department',
    },
    address: { bn: 'ঢাকা', en: 'Dhaka' },
    phone: '01700000000',
    email: 'contact@example.org',
  },
};

/** A data set with nothing in it, as the server answers a volunteer without projects. */
export const EMPTY_SNAPSHOT = {
  serverTime: '2026-10-31T10:00:00.000Z',
  nextSince: '2026-10-31T09:59:00.000Z',
  nextAfterId: null,
  hasMore: false,
  projects: [],
  formVersions: [],
  applications: [],
  applicationIds: [],
  locationsVersion: '0.0',
};

export const handlers = [
  http.get('*/api/v1/ping-sample', () => HttpResponse.json({ data: { pong: true } })),
  // every screen sits under the language provider, which reads the public settings
  http.get('*/api/v1/public/settings', () =>
    HttpResponse.json({ data: PUBLIC_SETTINGS, meta: { requestId: 'test' } }),
  ),
  // the bell of every signed-in page asks for the unread count
  http.get('*/api/v1/notifications/unread-count', () =>
    HttpResponse.json({ data: { count: 0 }, meta: { requestId: 'test' } }),
  ),
  // the home asks what waits for the person and shows the latest notifications
  http.get('*/api/v1/me/attention', () =>
    HttpResponse.json({ data: [], meta: { requestId: 'test' } }),
  ),
  http.get('*/api/v1/notifications', () =>
    HttpResponse.json({
      data: [],
      meta: { requestId: 'test', nextCursor: null, prevCursor: null, unreadCount: 0 },
    }),
  ),
  // the sync engine of a signed-in volunteer pulls the data set and the locations master
  http.get('*/api/v1/sync/snapshot', () =>
    HttpResponse.json({ data: EMPTY_SNAPSHOT, meta: { requestId: 'test' } }),
  ),
  http.get('*/api/v1/locations/all', () =>
    HttpResponse.json({ data: [], meta: { requestId: 'test' } }),
  ),
];
