import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing/index.js';
import { VisuallyHidden } from './VisuallyHidden.js';

describe('VisuallyHidden', () => {
  it('gives an icon-only button an accessible name', async () => {
    const { container } = render(
      <button type="button">
        <svg aria-hidden="true" width="16" height="16" />
        <VisuallyHidden>সার্চ</VisuallyHidden>
      </button>,
    );

    expect(screen.getByRole('button', { name: 'সার্চ' })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
