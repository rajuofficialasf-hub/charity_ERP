import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeUploadServer } from '../../test/upload-server';
import { resetClientForTests } from './api';
import { server } from '../../test/msw/server';
import { apiError } from '../../test/auth';
import { http } from 'msw';
import {
  PART_RETRY_DELAYS_MS,
  sha256Hex,
  uploadFile,
  UploadStopped,
  type UploadTarget,
} from './uploads';

// The client of the chunked upload: the parts in order with progress, a retried part, the resume.
const PART = 262_144;
const target: UploadTarget = {
  kind: 'distribution_proof',
  entityType: 'application',
  entityId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  slot: 'distribution_proof',
  source: 'camera',
};
const photo = (size = PART * 2 + 1000) =>
  new Blob([new Uint8Array(size).map((_, i) => i % 251)], { type: 'image/jpeg' });

beforeEach(() => resetClientForTests());

describe('uploadFile', () => {
  it('sends three parts in order with progress from 0 to 100, then finalizes', async () => {
    const fake = fakeUploadServer();
    const blob = photo();
    const progress: number[] = [];
    const stored = await uploadFile(blob, target, {
      clientUuid: '0190a1b2-c3d4-7e5f-8a9b-000000000001',
      onProgress: (p) => progress.push(p),
    });
    expect(fake.parts).toEqual([1, 2, 3]);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(100);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);
    expect(fake.finalized).toBe(1);
    expect(stored.virusScan).toBe('pending');
    const sent = fake.creates[0]!;
    expect(sent).toMatchObject({
      sizeBytes: blob.size,
      mime: 'image/jpeg',
      kind: 'distribution_proof',
    });
    expect(sent.sha256).toBe(
      createHash('sha256')
        .update(new Uint8Array(await blob.arrayBuffer()))
        .digest('hex'),
    );
    expect(await sha256Hex(blob)).toBe(sent.sha256);
  });

  it('sends a dropped part again after a pause', async () => {
    const fake = fakeUploadServer();
    fake.dropOnce.add(2);
    const pauses: number[] = [];
    await uploadFile(photo(), target, {
      clientUuid: '0190a1b2-c3d4-7e5f-8a9b-000000000002',
      sleep: async (ms) => void pauses.push(ms),
    });
    expect(fake.parts).toEqual([1, 2, 2, 3]);
    expect(pauses).toEqual([PART_RETRY_DELAYS_MS[0]]);
  });

  it('after a reload sends only the parts the server does not hold', async () => {
    const fake = fakeUploadServer();
    fake.held = [1, 3];
    const progress: number[] = [];
    await uploadFile(photo(), target, {
      clientUuid: '0190a1b2-c3d4-7e5f-8a9b-000000000003',
      onProgress: (p) => progress.push(p),
    });
    expect(fake.parts).toEqual([2]);
    // it starts from what the server holds, not from zero
    expect(progress[0]).toBeGreaterThan(0);
    expect(progress.at(-1)).toBe(100);
  });

  it('stops after the last pause when a part keeps failing', async () => {
    const fake = fakeUploadServer();
    fake.alwaysDrop.add(1);
    await expect(
      uploadFile(photo(10), target, {
        clientUuid: '0190a1b2-c3d4-7e5f-8a9b-000000000004',
        sleep: async () => undefined,
      }),
    ).rejects.toThrow();
    expect(fake.parts).toEqual(Array(PART_RETRY_DELAYS_MS.length + 1).fill(1));
    expect(fake.finalized).toBe(0);
  });

  it('sends a refused start again when the server is busy', async () => {
    const fake = fakeUploadServer();
    let busy = true;
    server.use(
      http.post('*/api/v1/upload-sessions', () => {
        if (!busy) return undefined;
        busy = false;
        return apiError(429, 'file.sessions_limit', 'Too many uploads.');
      }),
    );
    await uploadFile(photo(10), target, {
      clientUuid: '0190a1b2-c3d4-7e5f-8a9b-000000000005',
      sleep: async () => undefined,
    });
    expect(fake.finalized).toBe(1);
  });

  it('stops between two requests when its signal says so', async () => {
    const fake = fakeUploadServer();
    const stop = new AbortController();
    stop.abort();
    await expect(
      uploadFile(photo(10), target, {
        clientUuid: '0190a1b2-c3d4-7e5f-8a9b-000000000006',
        signal: stop.signal,
      }),
    ).rejects.toBeInstanceOf(UploadStopped);
    expect(fake.creates).toHaveLength(0);
  });
});
