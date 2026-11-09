import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../test/auth';
import { server } from '../../test/msw/server';
import { PersonBanner } from './PersonPhoto';

// The profile banner of a person, with the photo the API streams once it has arrived.
const FILE = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';

beforeEach(() => refreshAs(ME));

describe('PersonBanner', () => {
  it('shows the streamed photo of the person beside the name', async () => {
    server.use(
      http.get(
        `*/api/v1/files/${FILE}/content`,
        () =>
          new HttpResponse(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
            headers: { 'Content-Type': 'image/jpeg' },
          }),
      ),
    );
    const { container } = renderApp(<PersonBanner name="নমুনা স্বেচ্ছাসেবক" fileId={FILE} />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'নমুনা স্বেচ্ছাসেবক' }),
    ).toBeInTheDocument();
    await expect.poll(() => container.querySelector('img[src^="data:"]')).not.toBeNull();
  });

  it('shows the initial and asks for no file when the person has no photo', async () => {
    let asked = false;
    server.use(
      http.get('*/api/v1/files/:id/content', () => {
        asked = true;
        return new HttpResponse(null, { status: 404 });
      }),
    );
    const { container } = renderApp(<PersonBanner name="নমুনা স্বেচ্ছাসেবক" fileId={null} />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'নমুনা স্বেচ্ছাসেবক' }),
    ).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('ন')).toBeInTheDocument();
    expect(asked).toBe(false);
  });
});
