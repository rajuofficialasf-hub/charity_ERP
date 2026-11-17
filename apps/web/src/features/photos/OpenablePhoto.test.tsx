import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { OpenablePhoto } from './OpenablePhoto';

// A photo of a record that opens large among the photos of its group, at its own place.
const FIRST = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b01';
const SECOND = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b02';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

const PHOTOS = [
  { fileId: FIRST, alt: 'ছবি' },
  { fileId: SECOND, alt: 'NID-এর ছবি' },
];

beforeEach(() => {
  refreshAs(ME);
  server.use(
    http.get('*/api/v1/files/:id/content', () =>
      HttpResponse.arrayBuffer(JPEG.buffer, { headers: { 'Content-Type': 'image/jpeg' } }),
    ),
    http.get('*/api/v1/files/:id', ({ params }) =>
      HttpResponse.json({
        data: {
          id: String(params.id),
          kind: 'profile_photo',
          mime: 'image/jpeg',
          sizeBytes: 1024,
          capturedAt: null,
          uploadedAt: '2026-11-02T05:00:00.000Z',
          virusScan: 'clean',
          flags: [],
          duplicateOf: null,
          width: null,
          height: null,
          uploadedBy: null,
          records: [],
        },
        meta: {},
      }),
    ),
  );
});

describe('a photo that opens large', () => {
  it('opens the viewer at its own photo of the group, and closes it again', async () => {
    const user = userEvent.setup();
    renderApp(
      <>
        <OpenablePhoto photos={PHOTOS} index={0} title="নথি" />
        <OpenablePhoto photos={PHOTOS} index={1} title="নথি" />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'NID-এর ছবি বড় করে দেখুন' }));
    const dialog = await screen.findByRole('dialog', { name: 'ছবি' });
    expect(within(dialog).getByText('2টির মধ্যে 2')).toBeInTheDocument();
    expect(await within(dialog).findByRole('img', { name: 'NID-এর ছবি' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'আগের ছবি' }));
    expect(await within(dialog).findByRole('img', { name: 'ছবি' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'ছবি' })).not.toBeInTheDocument(),
    );
  });
});
