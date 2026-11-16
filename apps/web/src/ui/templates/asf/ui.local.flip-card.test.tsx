// @vitest-environment jsdom
// The flip card this app added to the asf template (listed in local.json): one size on both faces,
// turned by the pointer on a computer and by its buttons on a touch screen and from the keyboard,
// the hidden face out of reach, and no turn for people who ask for less motion.
import '@testing-library/jest-dom/vitest';

import type { ReactNode } from 'react';

import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { it, expect, describe, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import { FlipCard, UiProvider } from './index';
import { resetPage, stubMatchMedia, expectNoAxeViolations } from './local-test-support';

afterEach(() => {
  cleanup();
  resetPage();
});

/** The device: a computer's pointer, a touch screen, and whether less motion is asked for. */
function device(kind: 'computer' | 'touch', reducedMotion = false) {
  stubMatchMedia((query) => {
    if (query.includes('prefers-reduced-motion')) return reducedMotion;
    if (query.includes('hover: none')) return kind === 'touch';
    if (query.includes('hover: hover')) return kind === 'computer';
    return false;
  });
}

const BN = {
  flipDetails: 'বিস্তারিত',
  flipDetailsOf: '{title}: বিস্তারিত দেখুন',
  flipBack: 'ফিরুন',
  flipBackOf: 'সামনের দিকে ফিরুন',
  flipHint: 'কার্সর রাখলে বিস্তারিত',
};

function renderCard(card: ReactNode) {
  const router = createMemoryRouter(
    [
      { path: '/programs/1', element: <h1>Program page</h1> },
      { path: '*', element: card },
    ],
    { initialEntries: ['/'] }
  );
  return render(
    <UiProvider labels={BN}>
      <RouterProvider router={router} />
    </UiProvider>
  );
}

const sample = (title = 'স্বাবলম্বী প্রকল্প') => (
  <FlipCard
    title={title}
    to="/programs/1"
    badge="প্রোগ্রাম"
    media={<svg data-testid="cover" aria-hidden="true" />}
    front={<p>মোট প্রকল্প 4</p>}
    backEyebrow="প্রোগ্রামের খুঁটিনাটি"
    back={
      <>
        <p>প্রোগ্রাম ম্যানেজার</p>
        <a href="/programs/1">সব প্রকল্প দেখুন</a>
      </>
    }
  />
);

const faceOf = (container: HTMLElement, side: 'front' | 'back') =>
  container.querySelector<HTMLElement>(`[data-face="${side}"]`)!;
const innerOf = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-flip-inner]')!;

describe('the faces', () => {
  it('shows the front, and keeps the back out of the accessibility tree and the tab order until the card turns', async () => {
    device('computer');
    const user = userEvent.setup();
    const { container } = renderCard(sample());
    expect(screen.getByRole('article', { name: 'স্বাবলম্বী প্রকল্প' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'স্বাবলম্বী প্রকল্প' })).toBeInTheDocument();
    expect(screen.getByText('মোট প্রকল্প 4')).toBeVisible();
    // the back is hidden from screen readers and from the keyboard
    expect(faceOf(container, 'back')).toHaveAttribute('aria-hidden', 'true');
    expect(faceOf(container, 'back')).toHaveAttribute('inert');
    expect(screen.queryByRole('link', { name: 'সব প্রকল্প দেখুন' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'সামনের দিকে ফিরুন' })).not.toBeInTheDocument();
    // the pointer resting on the card turns it; leaving turns it back
    await user.hover(screen.getByRole('article'));
    expect(innerOf(container).style.transform || getComputedStyle(innerOf(container)).transform).toContain('rotateY(180deg)');
    expect(screen.getByRole('article')).toHaveAttribute('data-turned', 'true');
    expect(faceOf(container, 'front')).toHaveAttribute('aria-hidden', 'true');
    expect(faceOf(container, 'back')).not.toHaveAttribute('aria-hidden');
    expect(screen.getByRole('link', { name: 'সব প্রকল্প দেখুন' })).toBeInTheDocument();
    await user.unhover(screen.getByRole('article'));
    expect(screen.getByRole('article')).toHaveAttribute('data-turned', 'false');
  });

  it('opens the title from the front', async () => {
    device('touch');
    const user = userEvent.setup();
    renderCard(sample());
    await user.click(screen.getByRole('link', { name: 'স্বাবলম্বী প্রকল্প' }));
    expect(await screen.findByRole('heading', { name: 'Program page' })).toBeInTheDocument();
  });

  it('keeps a long title within the card: it breaks anywhere and stops after two lines', () => {
    device('computer');
    const long = 'অতিদরিদ্র-পরিবারের-স্বাবলম্বীকরণ-ও-জীবিকা-উন্নয়ন-প্রকল্প-২০২৬-২০২৭-বিশেষ-কার্যক্রম'.repeat(3);
    const { container } = renderCard(sample(long));
    const title = container.querySelector<HTMLElement>('[data-flip-title]')!;
    const style = getComputedStyle(title);
    expect(style.overflow).toBe('hidden');
    expect(style.getPropertyValue('overflow-wrap')).toBe('anywhere');
    expect(style.getPropertyValue('-webkit-line-clamp')).toBe('2');
  });
});

describe('turning on a touch screen and from the keyboard', () => {
  it('turns by "বিস্তারিত" and back by "ফিরুন", each named for a screen reader, the focus following', async () => {
    device('touch');
    const user = userEvent.setup();
    const { container } = renderCard(sample());
    // a touch screen has no pointer to rest: no hint, the button instead
    expect(screen.queryByText('কার্সর রাখলে বিস্তারিত')).not.toBeInTheDocument();
    const details = screen.getByRole('button', { name: 'স্বাবলম্বী প্রকল্প: বিস্তারিত দেখুন' });
    expect(details).toHaveTextContent('বিস্তারিত');
    await user.click(details);
    expect(screen.getByRole('article')).toHaveAttribute('data-turned', 'true');
    const back = screen.getByRole('button', { name: 'সামনের দিকে ফিরুন' });
    expect(back).toHaveTextContent('ফিরুন');
    // the focus is on the back, which is now in reach, and the front is not
    expect(back).toHaveFocus();
    expect(faceOf(container, 'front')).toHaveAttribute('inert');
    await user.click(back);
    expect(screen.getByRole('article')).toHaveAttribute('data-turned', 'false');
    expect(screen.getByRole('button', { name: 'স্বাবলম্বী প্রকল্প: বিস্তারিত দেখুন' })).toHaveFocus();
  });

  it('turns when the keyboard goes to the back by the turn button on a computer, and turns back when the focus leaves the card', async () => {
    device('computer');
    const user = userEvent.setup();
    render(
      <UiProvider labels={BN}>
        <FlipCard title="শীতবস্ত্র" front={<p>সামনে</p>} back={<button type="button">পিছনের কাজ</button>} />
        <button type="button">পরের কার্ড</button>
      </UiProvider>
    );
    // on a computer the hint stands in its place, and the button shows when the keyboard reaches it
    expect(screen.getByText('কার্সর রাখলে বিস্তারিত')).toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole('button', { name: 'শীতবস্ত্র: বিস্তারিত দেখুন' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('article')).toHaveAttribute('data-turned', 'true');
    expect(screen.getByRole('button', { name: 'সামনের দিকে ফিরুন' })).toHaveFocus();
    // the focus entering the back's own buttons keeps the card turned
    await user.tab();
    expect(screen.getByRole('button', { name: 'পিছনের কাজ' })).toHaveFocus();
    expect(screen.getByRole('article')).toHaveAttribute('data-turned', 'true');
    // and leaving the card turns it back
    await user.tab();
    expect(screen.getByRole('button', { name: 'পরের কার্ড' })).toHaveFocus();
    expect(screen.getByRole('article')).toHaveAttribute('data-turned', 'false');
  });

  it('keeps a touch screen’s card as it is when a finger only passes over it', () => {
    device('touch');
    renderCard(sample());
    fireEvent.mouseEnter(screen.getByRole('article'));
    expect(screen.getByRole('article')).toHaveAttribute('data-turned', 'false');
  });
});

describe('motion', () => {
  it('turns with the 3D turn, and without it for people who ask for less motion', () => {
    device('computer');
    const { container, unmount } = renderCard(sample());
    expect(getComputedStyle(innerOf(container)).transition).toContain('transform');
    unmount();
    device('computer', true);
    const reduced = renderCard(sample());
    expect(getComputedStyle(innerOf(reduced.container)).transition).toBe('none');
  });
});

describe('the flip card in both modes', () => {
  it.each(['light', 'dark'] as const)('passes axe on each face, %s', async (mode) => {
    window.localStorage.setItem('asf-mode', mode);
    device('touch');
    const user = userEvent.setup();
    const { container } = renderCard(sample());
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole('button', { name: 'স্বাবলম্বী প্রকল্প: বিস্তারিত দেখুন' }));
    await expectNoAxeViolations(container);
  });
});
