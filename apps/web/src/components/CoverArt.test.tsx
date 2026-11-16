// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CoverArt } from './CoverArt';

// The drawn cover of a card without a photo: the same picture for the same record, another one
// for another, in the asf greens, hidden from screen readers.
const drawn = (seed: string) => render(<CoverArt seed={seed} />).container.innerHTML;

describe('the drawn cover', () => {
  it('draws the same picture for the same seed, and another for another seed', () => {
    const first = drawn('0196f0c2-7a40-7000-8000-000000000001');
    expect(drawn('0196f0c2-7a40-7000-8000-000000000001')).toBe(first);
    expect(drawn('0196f0c2-7a40-7000-8000-000000000002')).not.toBe(first);
  });

  it('paints with the page tokens of the green scale only, and is hidden from screen readers', () => {
    const { container } = render(<CoverArt seed="series-swb" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    const fills = [...svg.querySelectorAll('[fill]')].map((node) => node.getAttribute('fill'));
    expect(fills.length).toBeGreaterThanOrEqual(5);
    for (const fill of fills) expect(fill).toMatch(/^var\(--color-art-/);
    // lighter to darker from the sky to the front hill, by the tokens of one scale
    expect(fills).toEqual([
      'var(--color-art-primary-lighter)',
      'var(--color-art-sun)',
      'var(--color-art-primary-main)',
      'var(--color-art-primary-dark)',
      'var(--color-art-primary-darker)',
    ]);
  });
});
