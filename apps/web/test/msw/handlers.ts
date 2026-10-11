import { http, HttpResponse } from 'msw';

/**
 * Default request handlers for component tests. Real handlers are typed from
 * docs/api/openapi.yaml as screens are built (TEST_STRATEGY section 2); this sample proves the
 * wiring.
 */
export const handlers = [
  http.get('*/api/v1/ping-sample', () => HttpResponse.json({ data: { pong: true } })),
];
