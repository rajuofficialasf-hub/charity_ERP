// @vitest-environment jsdom
// The flip card this app added to the asf template (listed in local.json): one size on both faces,
// turned by the pointer on a computer and by its buttons on a touch screen and from the keyboard,
// the hidden face out of reach, and no turn for people who ask for less motion.
import '@testing-library/jest-dom/vitest';

import type { ReactNode } from 'react';

import userEvent from '@testing-library/user-event';
import { Link, createMemoryRouter, RouterProvider } from 'react-router';
import { it, expect, describe, afterEach } from 'vitest';
import { act, render, screen, cleanup, fireEvent } from '@testing-library/react';

import { FlipCard, UiProvider } from './index';
import { resetPage, stubMatchMedia, expectNoAxeViolations } from './local-test-support';

afterEach(() => {
  cleanup();
  resetPage();
});

/**
 * The device: a computer's pointer, a touch screen, a device whose pointer can hover but is coarse
 * (neither of the two), and whether less motion is asked for.
 */
function device(kind: 'computer' | 'touch' | 'coarse', reducedMotion = false) {
  stubMatchMedia((query) => {
    if (query.includes('prefers-reduced-motion')) return reducedMotion;
    if (query.includes('hover: none')) return kind === 'touch';
    if (query.includes('hover: hover')) return kind === 'computer' && query.includes('pointer: fine');
    return false;
  });
}

/** Lets the card's own timers run: it decides on a lost focus once the focus has landed. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

const BN = {
  flipDetails: 'বিস্তারিত',
  flipDetailsOf: '{title}: বিস্তারিত দেখুন',
  flipBack: 'ফিরুন',
  flipBackOf: 'সামনের দিকে ফিরুন',
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
        <Link to="/programs/1">সব প্রকল্প দেখুন</Link>
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
    // a touch screen has no pointer to rest: the button
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
    // on a computer no hint is written, and the button shows when the keyboard reaches it
    expect(screen.queryByText('কার্সর রাখলে বিস্তারিত')).not.toBeInTheDocument();
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

describe('the review of the card', () => {
  it('keeps the back after a tap on its text, and its link still opens', async () => {
    device('touch');
    const user = userEvent.setup();
    const { container } = renderCard(sample());
    await user.click(screen.getByRole('button', { name: 'স্বাবলম্বী প্রকল্প: বিস্তারিত দেখুন' }));
    const back = screen.getByRole('button', { name: 'সামনের দিকে ফিরুন' });
    expect(back).toHaveFocus();
    // a finger on the back's text: the focus goes to the page, the card stays turned
    const text = screen.getByText('প্রোগ্রাম ম্যানেজার');
    fireEvent.pointerDown(text, { pointerType: 'touch' });
    act(() => back.blur());
    await settle();
    fireEvent.pointerUp(text, { pointerType: 'touch' });
    await settle();
    expect(screen.getByRole('article')).toHaveAttribute('data-turned', 'true');
    expect(faceOf(container, 'back')).not.toHaveAttribute('inert');
    // a tap on the back's link, which Safari does not focus, lands on the link and opens it
    const link = screen.getByRole('link', { name: 'সব প্রকল্প দেখুন' });
    fireEvent.pointerDown(link, { pointerType: 'touch' });
    await settle();
    await user.click(link);
    expect(await screen.findByRole('heading', { name: 'Program page' })).toBeInTheDocument();
  });

  it('turns back when the keyboard leaves the card, on a touch screen too', async () => {
    device('touch');
    const user = userEvent.setup();
    render(
      <UiProvider labels={BN}>
        <FlipCard title="শীতবস্ত্র" front={<p>সামনে</p>} back={<p>পিছনে</p>} />
        <button type="button">পরের কার্ড</button>
      </UiProvider>
    );
    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('article')).toHaveAttribute('data-turned', 'true');
    await user.tab();
    await settle();
    expect(screen.getByRole('button', { name: 'পরের কার্ড' })).toHaveFocus();
    expect(screen.getByRole('article')).toHaveAttribute('data-turned', 'false');
  });

  it('shows the button and no hint on a device whose pointer can hover but is coarse', () => {
    device('coarse');
    renderCard(sample());
    expect(screen.queryByText('কার্সর রাখলে বিস্তারিত')).not.toBeInTheDocument();
    const details = screen.getByRole('button', { name: 'স্বাবলম্বী প্রকল্প: বিস্তারিত দেখুন' });
    // not the computer's hidden-until-focused button: shown as it is
    expect(getComputedStyle(details).position).toBe('relative');
    expect(getComputedStyle(details).clip).not.toBe('rect(0 0 0 0)');
    fireEvent.pointerEnter(screen.getByRole('article'), { pointerType: 'mouse' });
    expect(screen.getByRole('article')).toHaveAttribute('data-turned', 'false');
  });

  it('lets a finger on a computer\u2019s touch screen tap, while a mouse turns the card', () => {
    device('computer');
    renderCard(sample());
    const card = screen.getByRole('article');
    fireEvent.pointerEnter(card, { pointerType: 'touch' });
    expect(card).toHaveAttribute('data-turned', 'false');
    fireEvent.pointerEnter(card, { pointerType: 'mouse' });
    expect(card).toHaveAttribute('data-turned', 'true');
    // a finger leaving does not turn it back; the mouse leaving does
    fireEvent.pointerLeave(card, { pointerType: 'touch' });
    expect(card).toHaveAttribute('data-turned', 'true');
    fireEvent.pointerLeave(card, { pointerType: 'mouse' });
    expect(card).toHaveAttribute('data-turned', 'false');
  });

  it('scrolls a back taller than the card inside it, with its last link in reach of the keyboard', async () => {
    device('touch');
    const user = userEvent.setup();
    const { container } = render(
      <UiProvider labels={BN}>
        <FlipCard
          title="শীতবস্ত্র"
          height={240}
          front={<p>সামনে</p>}
          back={Array.from({ length: 30 }, (_, i) => (
            <a key={i} href={`#line-${i + 1}`}>
              {`লাইন ${i + 1}`}
            </a>
          ))}
        />
      </UiProvider>
    );
    for (const side of ['front', 'back'] as const) {
      const box = container.querySelector<HTMLElement>(`[data-face-content="${side}"]`)!;
      expect(getComputedStyle(box).overflowY).toBe('auto');
      expect(getComputedStyle(box).minHeight).toBe('0px');
    }
    await user.click(screen.getByRole('button', { name: 'শীতবস্ত্র: বিস্তারিত দেখুন' }));
    for (let i = 0; i < 30; i += 1) await user.tab();
    expect(screen.getByRole('link', { name: 'লাইন 30' })).toHaveFocus();
    expect(screen.getByRole('article')).toHaveAttribute('data-turned', 'true');
  });

  it('draws the title link\u2019s focus ring on its overlay, inside the card', () => {
    device('computer');
    renderCard(sample());
    const rules = [...document.querySelectorAll('style')].map((style) => style.textContent ?? '').join('\n');
    expect(rules).toMatch(/:focus-visible::after\{[^}]*outline:2px solid/);
    expect(rules).toMatch(/:focus-visible::after\{[^}]*outline-offset:-2px/);
  });

  it('forgets a press let go outside the card, so the keyboard leaving still turns it back', async () => {
    device('touch');
    const user = userEvent.setup();
    render(
      <UiProvider labels={BN}>
        <FlipCard title="শীতবস্ত্র" front={<p>সামনে</p>} back={<p>পিছনের লেখা</p>} />
        <button type="button">পরের কার্ড</button>
      </UiProvider>
    );
    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('article')).toHaveAttribute('data-turned', 'true');
    // a mouse pressed on the back's text and let go outside the card
    fireEvent.pointerDown(screen.getByText('পিছনের লেখা'), { pointerType: 'mouse' });
    fireEvent.pointerUp(document.body, { pointerType: 'mouse' });
    await settle();
    expect(screen.getByRole('button', { name: 'সামনের দিকে ফিরুন' })).toHaveFocus();
    await user.tab();
    await settle();
    expect(screen.getByRole('button', { name: 'পরের কার্ড' })).toHaveFocus();
    expect(screen.getByRole('article')).toHaveAttribute('data-turned', 'false');
  });

  it('shows "বিস্তারিত" on a computer once a finger has touched the page, and hides it again after a mouse press', () => {
    device('computer');
    renderCard(sample());
    fireEvent.pointerDown(document.body, { pointerType: 'touch' });
    const details = screen.getByRole('button', { name: 'স্বাবলম্বী প্রকল্প: বিস্তারিত দেখুন' });
    expect(getComputedStyle(details).position).toBe('relative');
    expect(getComputedStyle(details).clip).not.toBe('rect(0 0 0 0)');
    fireEvent.click(details);
    expect(screen.getByRole('article')).toHaveAttribute('data-turned', 'true');
    fireEvent.pointerDown(document.body, { pointerType: 'mouse' });
    // the front is behind the turned card now, so the button is read with the hidden elements
    const hidden = screen.getByRole('button', {
      name: 'স্বাবলম্বী প্রকল্প: বিস্তারিত দেখুন',
      hidden: true,
    });
    expect(getComputedStyle(hidden).position).toBe('absolute');
  });
});
