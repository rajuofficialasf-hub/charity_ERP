// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '@/ui';
import { useLabels } from '@/ui/templates/asf/components/labels';
import { expectNoAxeViolations, renderWithUi } from './testing';

// The asf test helpers: the provider with the catalogue's words, and a failing axe check.
function Probe() {
  return <p>{useLabels().mainNavigation}</p>;
}

describe('the asf test helpers', () => {
  it.each([
    ['bn', 'প্রধান মেনু'],
    ['en', 'Main menu'],
  ] as const)('render with the asf words in %s', (locale, word) => {
    renderWithUi(<Probe />, { locale });
    expect(screen.getByText(word)).toBeInTheDocument();
  });

  it('passes a clean piece and fails on a violation', async () => {
    const clean = renderWithUi(<Button>Save</Button>);
    await expectNoAxeViolations(clean.container);
    const broken = renderWithUi(<img src="x.png" />);
    await expect(expectNoAxeViolations(broken.container)).rejects.toThrow(/image-alt/);
  });
});
