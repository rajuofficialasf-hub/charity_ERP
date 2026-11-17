// @vitest-environment jsdom
// The photo viewer this app added to the asf template (listed in local.json): the record's photos
// one press or one arrow away, zoom by its buttons and keys, the details beside the photo on a wide
// screen and in a sheet on a narrow one, and no way to delete anything.
import '@testing-library/jest-dom/vitest';

import type { ViewerPhoto } from '@/ui/contract';

import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { it, vi, expect, describe, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';

import { UiProvider, PhotoViewer } from './index';
import { resetPage, stubMatchMedia, expectNoAxeViolations } from './local-test-support';

afterEach(() => {
  cleanup();
  resetPage();
  // the stand-in full screen of a test, never left for the next
  delete (HTMLElement.prototype as Partial<HTMLElement>).requestFullscreen;
});

/** A wide screen of 1024 px and more, or a narrow one; the device stays light. */
function width(wide: boolean) {
  stubMatchMedia((query) => {
    if (query.includes('dark')) return false;
    if (query.includes('1024px')) return wide;
    if (query.includes('max-width')) return !wide;
    return false;
  });
}

const PHOTOS: ViewerPhoto[] = [
  { id: 'a', src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', alt: 'The house before' },
  { id: 'b', src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', alt: 'The roof' },
  { id: 'c', alt: 'The door', message: 'Being checked' },
];

const BN = {
  photoViewer: 'ছবি',
  photoPosition: '{count}টির মধ্যে {index}',
  previousPhoto: 'আগের ছবি',
  nextPhoto: 'পরের ছবি',
  zoomIn: 'বড় করে দেখুন',
  zoomOut: 'ছোট করে দেখুন',
  zoomReset: 'পুরো ছবি দেখুন',
  fullScreen: 'পুরো পর্দায় দেখুন',
  leaveFullScreen: 'পুরো পর্দা থেকে বের হোন',
  photoDetails: 'বিস্তারিত',
  photoStrip: 'ছবিগুলো',
  close: 'বন্ধ করুন',
};

function Viewer({
  start = 0,
  onClose = () => {},
  onIndexChange,
}: {
  start?: number;
  onClose?: () => void;
  onIndexChange?: (index: number) => void;
}) {
  const [index, setIndex] = useState(start);
  return (
    <PhotoViewer
      open
      onClose={onClose}
      photos={PHOTOS}
      index={index}
      onIndexChange={(next) => {
        onIndexChange?.(next);
        setIndex(next);
      }}
      title="Application APP-1"
      details={<p>Taken on 2 November</p>}
      actions={<button type="button">Download</button>}
    />
  );
}

const shown = () => screen.getByRole('img', { name: /The house before|The roof/ });

describe('the photo viewer', () => {
  it('moves between the photos by the arrows and its buttons, and stops at the ends', async () => {
    width(true);
    const user = userEvent.setup();
    const moved = vi.fn();
    render(
      <UiProvider>
        <Viewer onIndexChange={moved} />
      </UiProvider>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Photo' });
    expect(within(dialog).getByText('1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous photo' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.keyboard('{ArrowLeft}');
    expect(moved).not.toHaveBeenCalled();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('img', { name: 'The roof' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(screen.getByText('Being checked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next photo' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.keyboard('{ArrowRight}');
    // a press at the end does nothing, and the focus stays on the button
    await user.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(screen.getByRole('button', { name: 'Next photo' })).toHaveFocus();
    expect(moved.mock.calls).toEqual([[1], [2]]);
    // the strip names each photo and marks the one shown
    const strip = screen.getByRole('list', { name: 'Photos' });
    await user.click(within(strip).getByRole('button', { name: 'The house before' }));
    expect(within(strip).getByRole('button', { name: 'The house before' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('zooms by its buttons and the keys, and shows the whole photo again', async () => {
    width(true);
    const user = userEvent.setup();
    render(
      <UiProvider>
        <Viewer />
      </UiProvider>,
    );
    expect(shown().style.transform).toContain('scale(1)');
    expect(screen.getByRole('button', { name: 'Zoom out' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(shown().style.transform).toContain('scale(1.5)');
    await user.keyboard('+');
    expect(shown().style.transform).toContain('scale(2)');
    await user.keyboard('-');
    expect(shown().style.transform).toContain('scale(1.5)');
    await user.keyboard('0');
    expect(shown().style.transform).toContain('scale(1)');
    // another photo starts whole
    await user.keyboard('+');
    await user.keyboard('{ArrowRight}');
    expect(shown().style.transform).toContain('scale(1)');
  });

  it('closes by Escape and by its close button', async () => {
    width(true);
    const user = userEvent.setup();
    const closed = vi.fn();
    render(
      <UiProvider>
        <Viewer onClose={closed} />
      </UiProvider>,
    );
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(closed).toHaveBeenCalledTimes(2);
  });

  it('shows the details beside the photo on a wide screen', async () => {
    width(true);
    render(
      <UiProvider>
        <Viewer />
      </UiProvider>,
    );
    expect(screen.getByRole('complementary', { name: 'Details' })).toHaveTextContent(
      'Taken on 2 November',
    );
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
  });

  it('opens the details as a sheet on a narrow screen', async () => {
    width(false);
    const user = userEvent.setup();
    render(
      <UiProvider>
        <Viewer />
      </UiProvider>,
    );
    expect(screen.queryByText('Taken on 2 November')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Details' }));
    const sheet = screen.getByRole('dialog', { name: 'Details' });
    expect(sheet).toHaveTextContent('Taken on 2 November');
  });

  it('offers no way to delete a photo', () => {
    width(true);
    render(
      <UiProvider>
        <Viewer />
      </UiProvider>,
    );
    expect(screen.queryByRole('button', { name: /delete|remove|মুছ/i })).not.toBeInTheDocument();
  });

  it('names every control in Bengali, and has no accessibility violation', async () => {
    width(true);
    // a browser with a full screen, which jsdom is not
    const fullScreen = vi.fn(() => Promise.resolve());
    HTMLElement.prototype.requestFullscreen = fullScreen;
    render(
      <UiProvider labels={BN}>
        <Viewer start={1} />
      </UiProvider>,
    );
    const dialog = screen.getByRole('dialog', { name: 'ছবি' });
    expect(within(dialog).getByText('3টির মধ্যে 2')).toBeInTheDocument();
    for (const name of [
      'আগের ছবি',
      'পরের ছবি',
      'বড় করে দেখুন',
      'ছোট করে দেখুন',
      'পুরো ছবি দেখুন',
      'পুরো পর্দায় দেখুন',
      'বন্ধ করুন',
    ])
      expect(within(dialog).getByRole('button', { name })).toBeInTheDocument();
    await expectNoAxeViolations(dialog);
    await userEvent
      .setup()
      .click(within(dialog).getByRole('button', { name: 'পুরো পর্দায় দেখুন' }));
    expect(fullScreen).toHaveBeenCalledTimes(1);
  });

  it('offers no full screen where the browser has none', () => {
    width(true);
    render(
      <UiProvider>
        <Viewer />
      </UiProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Full screen' })).not.toBeInTheDocument();
  });
});
