import { http, HttpResponse } from 'msw';
import { server } from './msw/server';

const PART = 262_144;

export interface FakeUpload {
  /** Every create body the server received. */
  creates: Record<string, unknown>[];
  /** The part numbers in the order they arrived (a refused one too). */
  parts: number[];
  finalized: number;
  /** The parts the next create answers as already held (a resume after a reload). */
  held: number[];
  /** Fails the next PUT of these part numbers once, as a dropped connection. */
  dropOnce: Set<number>;
  /** Fails every PUT of these part numbers. */
  alwaysDrop: Set<number>;
  /** The scan state finalize answers. */
  virusScan: 'pending' | 'skipped';
  /** The most sessions open at the same time (created, not yet finalized). */
  peakOpen: number;
}

/**
 * The upload routes of the API in memory: sessions by client id, the parts held, finalize; enough
 * for the web client and hook tests.
 */
export function fakeUploadServer(): FakeUpload {
  const state: FakeUpload = {
    creates: [],
    parts: [],
    finalized: 0,
    held: [],
    dropOnce: new Set(),
    alwaysDrop: new Set(),
    virusScan: 'pending',
    peakOpen: 0,
  };
  let open = 0;
  const sessions = new Map<string, { size: number; received: Set<number>; kind: string }>();
  const view = (id: string) => {
    const s = sessions.get(id)!;
    return {
      id,
      chunkSize: PART,
      partCount: Math.ceil(s.size / PART),
      partsReceived: [...s.received].sort((a, b) => a - b),
      bytesReceived: [...s.received].reduce(
        (sum, n) => sum + Math.min(PART, s.size - (n - 1) * PART),
        0,
      ),
      expiresAt: '2026-10-20T10:00:00.000Z',
      fileId: null,
    };
  };
  server.use(
    http.post('*/api/v1/upload-sessions', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      state.creates.push(body);
      open += 1;
      state.peakOpen = Math.max(state.peakOpen, open);
      const id = `0190a1b2-c3d4-7e5f-8a9b-${String(state.creates.length).padStart(12, '0')}`;
      sessions.set(id, {
        size: body.sizeBytes as number,
        received: new Set(state.held),
        kind: body.kind as string,
      });
      return HttpResponse.json({ data: view(id), meta: { requestId: 'req' } }, { status: 201 });
    }),
    http.put('*/api/v1/upload-sessions/:id/parts/:n', async ({ params, request }) => {
      const n = Number(params.n);
      state.parts.push(n);
      if (state.alwaysDrop.has(n)) return HttpResponse.error();
      if (state.dropOnce.has(n)) {
        state.dropOnce.delete(n);
        return HttpResponse.error();
      }
      await request.arrayBuffer();
      sessions.get(String(params.id))!.received.add(n);
      return HttpResponse.json({ data: view(String(params.id)), meta: { requestId: 'req' } });
    }),
    http.post('*/api/v1/upload-sessions/:id/finalize', ({ params }) => {
      state.finalized += 1;
      open -= 1;
      const s = sessions.get(String(params.id))!;
      return HttpResponse.json(
        {
          data: {
            id: '0190a1b2-c3d4-7e5f-8a9b-ffffffffffff',
            kind: s.kind,
            mime: 'image/jpeg',
            sizeBytes: s.size,
            capturedAt: null,
            uploadedAt: '2026-10-20T09:00:00.000Z',
            virusScan: state.virusScan,
            flags: [],
            duplicateOf: null,
          },
          meta: { requestId: 'req' },
        },
        { status: 201 },
      );
    }),
  );
  return state;
}
