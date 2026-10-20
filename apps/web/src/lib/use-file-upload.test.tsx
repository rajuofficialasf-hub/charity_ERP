import { act, waitFor } from '@testing-library/react';
import { http } from 'msw';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, refreshAs, ME, renderApp } from '../../test/auth';
import { server } from '../../test/msw/server';
import { fakeUploadServer } from '../../test/upload-server';
import { useFileUpload, type FileUploadTarget } from './use-file-upload';

// The upload hook of a field: metadata before compression, the checks, and the end states.
const order: string[] = [];
vi.mock('./photo-meta', () => ({
  readPhotoMeta: vi.fn(async (file: File) => {
    order.push(`meta:${file.name}`);
    return { capturedAt: '2026-10-20T08:05:00.000Z', gps: { lat: 23.81, lng: 90.41 } };
  }),
}));
vi.mock('./compress', () => ({
  compressImage: vi.fn(async (file: File) => {
    order.push(`compress:${file.name}`);
    return file;
  }),
}));

const target: FileUploadTarget = {
  kind: 'distribution_proof',
  entityType: 'application',
  entityId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  slot: 'distribution_proof',
  source: 'camera',
  sleep: async () => undefined,
};

type Hook = ReturnType<typeof useFileUpload>;
let hook: Hook;
/** Hands the hook's latest result to the test after each render. */
function Probe({ options, onHook }: { options: FileUploadTarget; onHook: (h: Hook) => void }) {
  const upload = useFileUpload(options);
  useEffect(() => onHook(upload));
  return null;
}

const jpeg = (name = 'photo.jpg', size = 300_000) =>
  new File([new Uint8Array(size).fill(7)], name, { type: 'image/jpeg' });

async function start(file: File, options: FileUploadTarget = target) {
  renderApp(
    <Probe
      options={options}
      onHook={(h) => {
        hook = h;
      }}
    />,
    'en',
  );
  await waitFor(() => expect(hook).toBeDefined());
  act(() => hook.add([file]));
  await waitFor(() =>
    expect(['ready', 'quarantined', 'rejected', 'failed']).toContain(hook.items[0]?.state),
  );
  return hook.items[0]!;
}

beforeEach(() => {
  order.length = 0;
  refreshAs(ME);
  // jsdom makes no object URLs; the previews only need a value
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
  vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
});

describe('useFileUpload', () => {
  it('reads capture time and position before compressing, and ends quarantined while the scan waits', async () => {
    const fake = fakeUploadServer();
    const uploaded = vi.fn();
    const item = await start(jpeg(), { ...target, onUploaded: uploaded });
    expect(order).toEqual(['meta:photo.jpg', 'compress:photo.jpg']);
    expect(fake.creates[0]).toMatchObject({
      capturedAt: '2026-10-20T08:05:00.000Z',
      gps: { lat: 23.81, lng: 90.41 },
    });
    expect(fake.parts).toEqual([1, 2]);
    expect(item).toMatchObject({ state: 'quarantined', progress: 100, removable: false });
    expect(item.reason).toBeTruthy();
    expect(uploaded).toHaveBeenCalledWith(expect.objectContaining({ virusScan: 'pending' }));
  });

  it('shows a file the scan cleared as ready', async () => {
    const fake = fakeUploadServer();
    fake.virusScan = 'skipped';
    expect((await start(jpeg())).state).toBe('ready');
  });

  it('never starts a session for a type the kind does not take', async () => {
    const fake = fakeUploadServer();
    const gif = new File([new Uint8Array(10)], 'anim.gif', { type: 'image/gif' });
    const item = await start(gif);
    expect(item.state).toBe('rejected');
    expect(item.reason).toBeTruthy();
    expect(fake.creates).toHaveLength(0);
  });

  it("shows a duplicate as rejected with the server's message", async () => {
    fakeUploadServer();
    server.use(
      http.post('*/api/v1/upload-sessions/:id/finalize', () =>
        apiError(409, 'file.duplicate', 'The same file already exists in this project.'),
      ),
    );
    const item = await start(jpeg());
    expect(item).toMatchObject({
      state: 'rejected',
      reason: 'The same file already exists in this project.',
      removable: true,
    });
  });

  it('marks a lost connection as failed, and a retry resumes with the same client id', async () => {
    const fake = fakeUploadServer();
    fake.alwaysDrop.add(2);
    const item = await start(jpeg());
    expect(item.state).toBe('failed');
    fake.alwaysDrop.clear();
    act(() => hook.retry(item.id));
    await waitFor(() => expect(hook.items[0]?.state).toBe('quarantined'));
    expect(fake.creates).toHaveLength(2);
    expect(fake.creates[1]!.clientUuid).toBe(fake.creates[0]!.clientUuid);
    // the retry sends the same compressed bytes: the photo is not prepared again
    expect(order.filter((o) => o.startsWith('compress:'))).toHaveLength(1);
    expect(fake.creates[1]!.sha256).toBe(fake.creates[0]!.sha256);
  });

  it('sends at most three files at a time', async () => {
    const fake = fakeUploadServer();
    renderApp(
      <Probe
        options={target}
        onHook={(h) => {
          hook = h;
        }}
      />,
      'en',
    );
    await waitFor(() => expect(hook).toBeDefined());
    act(() => hook.add([1, 2, 3, 4, 5].map((n) => jpeg(`p${n}.jpg`, 1000))));
    await waitFor(() => expect(hook.items.every((i) => i.state === 'quarantined')).toBe(true));
    expect(fake.finalized).toBe(5);
    expect(fake.peakOpen).toBeLessThanOrEqual(3);
  });

  it('stops an upload whose file is taken off the field', async () => {
    const fake = fakeUploadServer();
    fake.dropOnce.add(2);
    let resume: () => void = () => undefined;
    const paused = new Promise<void>((resolve) => {
      resume = resolve;
    });
    renderApp(
      <Probe
        options={{ ...target, sleep: () => paused }}
        onHook={(h) => {
          hook = h;
        }}
      />,
      'en',
    );
    await waitFor(() => expect(hook).toBeDefined());
    act(() => hook.add([jpeg()]));
    // part 2 dropped and the upload waits before sending it again
    await waitFor(() => expect(fake.parts).toEqual([1, 2]));
    act(() => hook.remove(hook.items[0]!.id));
    resume();
    await new Promise((r) => setTimeout(r, 50));
    expect(hook.items).toHaveLength(0);
    expect(fake.finalized).toBe(0);
  });

  it('keeps a stored file stored when the caller fails to handle it', async () => {
    fakeUploadServer();
    const item = await start(jpeg(), {
      ...target,
      onUploaded: () => {
        throw new Error('the page failed');
      },
    });
    expect(item.state).toBe('quarantined');
  });
});
