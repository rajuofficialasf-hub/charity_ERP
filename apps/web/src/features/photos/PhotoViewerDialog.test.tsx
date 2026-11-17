import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { saveFile } from '../../lib/save-file';
import { PhotoViewerDialog } from './PhotoViewerDialog';

vi.mock('../../lib/save-file', () => ({ saveFile: vi.fn() }));

// The app's photo viewer over the API: the photo streamed, its details, the download that keeps
// the server's name, and the app's own link of the photo.
const FRONT = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a51';
const BACK = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a52';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

const details = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  kind: 'distribution_proof',
  mime: 'image/jpeg',
  sizeBytes: 245_760,
  capturedAt: '2026-11-02T04:30:15.000Z',
  uploadedAt: '2026-11-02T05:00:00.000Z',
  gps: { lat: 23.8103, lng: 90.4125, accuracyM: 8 },
  virusScan: 'clean',
  flags: [],
  duplicateOf: null,
  width: 1600,
  height: 1200,
  uploadedBy: { name: 'রহিমা খাতুন' },
  records: [{ entityType: 'application', entityId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a60' }],
  ...over,
});

function serve(over: Record<string, unknown> = {}) {
  server.use(
    http.get('*/api/v1/files/:id/content', () =>
      HttpResponse.arrayBuffer(JPEG.buffer, { headers: { 'Content-Type': 'image/jpeg' } }),
    ),
    http.get('*/api/v1/files/:id', ({ params }) =>
      HttpResponse.json({ data: details(String(params.id), over), meta: {} }),
    ),
  );
}

const PHOTOS = [
  { fileId: FRONT, alt: 'বাড়ির সামনে' },
  { fileId: BACK, alt: 'বাড়ির পেছনে' },
];

const open = () =>
  renderApp(<PhotoViewerDialog open onClose={() => {}} photos={PHOTOS} title="আবেদনের ছবি" />);

beforeEach(() => {
  refreshAs(ME);
  vi.mocked(saveFile).mockClear();
});

describe('the photo viewer of the app', () => {
  it('shows the photo with every detail an official reads', async () => {
    serve();
    open();
    const dialog = await screen.findByRole('dialog', { name: 'ছবি' });
    expect(await within(dialog).findByRole('img', { name: 'বাড়ির সামনে' })).toBeInTheDocument();
    // the test's screen is narrow, so the details open as a sheet
    await userEvent.click(within(dialog).getByRole('button', { name: 'বিস্তারিত' }));
    expect(await screen.findByText('তোলার সময়')).toBeInTheDocument();
    expect(screen.getByText('অবস্থান')).toBeInTheDocument();
    expect(screen.getByText('23.8103, 90.4125 · ±8 m')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'মানচিত্রে দেখুন' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=23.8103,90.4125',
    );
    expect(screen.getByText('240 KB')).toBeInTheDocument();
    expect(screen.getByText('1600 × 1200 পিক্সেল')).toBeInTheDocument();
    expect(screen.getByText('রহিমা খাতুন')).toBeInTheDocument();
  });

  it("lists no place and no uploader's name for a volunteer who may not see them", async () => {
    const volunteerView: Record<string, unknown> = details(FRONT, { uploadedBy: null });
    delete volunteerView.gps;
    server.use(
      http.get('*/api/v1/files/:id/content', () =>
        HttpResponse.arrayBuffer(JPEG.buffer, { headers: { 'Content-Type': 'image/jpeg' } }),
      ),
      http.get('*/api/v1/files/:id', () => HttpResponse.json({ data: volunteerView, meta: {} })),
    );
    open();
    const dialog = await screen.findByRole('dialog', { name: 'ছবি' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'বিস্তারিত' }));
    expect(await screen.findByText('তোলার সময়')).toBeInTheDocument();
    expect(screen.queryByText('অবস্থান')).not.toBeInTheDocument();
    expect(screen.getAllByText('জানা নেই')).toHaveLength(1);
  });

  it("saves the photo under the server's name, and says so when it cannot", async () => {
    serve();
    let downloads = 0;
    server.use(
      http.get(`*/api/v1/files/${FRONT}/download`, () => {
        downloads += 1;
        return downloads === 1
          ? HttpResponse.arrayBuffer(JPEG.buffer, {
              headers: {
                'Content-Type': 'image/jpeg',
                'Content-Disposition': 'attachment; filename="photo-20261102-103015-0190a1b2.jpg"',
              },
            })
          : apiError(500, 'server.error', 'failed');
      }),
    );
    const user = userEvent.setup();
    open();
    const dialog = await screen.findByRole('dialog', { name: 'ছবি' });
    await within(dialog).findByRole('img', { name: 'বাড়ির সামনে' });
    await user.click(within(dialog).getByRole('button', { name: 'ডাউনলোড' }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveFile).mock.calls[0]![1]).toBe('photo-20261102-103015-0190a1b2.jpg');
    await user.click(within(dialog).getByRole('button', { name: 'ডাউনলোড' }));
    expect(
      await screen.findByText('ছবিটি ডাউনলোড করা যায়নি। আবার চেষ্টা করুন।'),
    ).toBeInTheDocument();
  });

  it("copies the app's own address of the photo shown", async () => {
    serve();
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    open();
    const dialog = await screen.findByRole('dialog', { name: 'ছবি' });
    await user.click(within(dialog).getByRole('button', { name: 'পরের ছবি' }));
    await user.click(within(dialog).getByRole('button', { name: 'লিংক কপি করুন' }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/photos/${BACK}`);
  });

  it('says a blocked photo is blocked, and that its details could not be read', async () => {
    serve();
    server.use(
      http.get(`*/api/v1/files/${FRONT}/content`, () => apiError(410, 'file.infected', 'infected')),
      // a refusal is not tried again, so its message comes at once
      http.get(`*/api/v1/files/${FRONT}`, () => apiError(404, 'permission.not_found', 'not found')),
    );
    open();
    expect(
      await screen.findByText('নিরাপত্তা যাচাইয়ে ফাইলটি আটকে দেওয়া হয়েছে।'),
    ).toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: 'ছবি' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'বিস্তারিত' }));
    expect(await screen.findByText('কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।')).toBeInTheDocument();
  });

  it('says so when the download is refused', async () => {
    serve();
    server.use(
      http.get(`*/api/v1/files/${FRONT}/download`, () =>
        apiError(404, 'permission.not_found', 'not found'),
      ),
    );
    const user = userEvent.setup();
    open();
    const dialog = await screen.findByRole('dialog', { name: 'ছবি' });
    await within(dialog).findByRole('img', { name: 'বাড়ির সামনে' });
    await user.click(within(dialog).getByRole('button', { name: 'ডাউনলোড' }));
    expect(
      await screen.findByText('ছবিটি ডাউনলোড করা যায়নি। আবার চেষ্টা করুন।'),
    ).toBeInTheDocument();
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('says a photo is still being checked in place of the picture', async () => {
    serve();
    server.use(
      http.get(`*/api/v1/files/${FRONT}/content`, () =>
        apiError(423, 'file.quarantined', 'quarantined'),
      ),
    );
    open();
    expect(await screen.findByText('ফাইলটি যাচাই হচ্ছে; শেষ হলে দেখা যাবে।')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ডাউনলোড' })).toBeDisabled();
  });
});
