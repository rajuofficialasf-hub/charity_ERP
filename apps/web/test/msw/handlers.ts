import { http, HttpResponse } from 'msw';

/**
 * Default request handlers for component tests. Real handlers are typed from
 * docs/api/openapi.yaml as screens are built (TEST_STRATEGY section 2); this sample proves the
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
];
