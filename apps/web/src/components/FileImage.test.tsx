import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiError, ME, refreshAs, renderApp } from '../../test/auth';
import { server } from '../../test/msw/server';
import { FileImage } from './FileImage';

// A private photo streamed by the API: shown once cleared, its scan state otherwise.
const FILE = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const serve = (answer: () => Response) =>
  server.use(http.get(`*/api/v1/files/${FILE}/content`, answer));

beforeEach(() => refreshAs(ME));

describe('FileImage', () => {
  it('shows a cleared photo', async () => {
    serve(
      () =>
        new HttpResponse(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
          headers: { 'Content-Type': 'image/jpeg' },
        }),
    );
    renderApp(<FileImage fileId={FILE} alt="ছবি" />);
    expect(await screen.findByRole('img', { name: 'ছবি' })).toBeInTheDocument();
  });

  it('says a photo is waiting for its scan, and that a blocked one is blocked', async () => {
    serve(() => apiError(423, 'file.quarantined', 'quarantined'));
    const first = renderApp(<FileImage fileId={FILE} alt="ছবি" />);
    expect(await screen.findByText('ফাইলটি যাচাই হচ্ছে; শেষ হলে দেখা যাবে।')).toBeInTheDocument();
    first.unmount();
    serve(() => apiError(410, 'file.infected', 'infected'));
    renderApp(<FileImage fileId={FILE} alt="ছবি" />);
    expect(
      await screen.findByText('নিরাপত্তা যাচাইয়ে ফাইলটি আটকে দেওয়া হয়েছে।'),
    ).toBeInTheDocument();
  });
});
