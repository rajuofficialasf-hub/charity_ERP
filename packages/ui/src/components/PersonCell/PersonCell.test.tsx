import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { PersonCell } from './PersonCell.js';

describe('PersonCell', () => {
  it('names the person as a link, with a muted second line and the letter tile', async () => {
    const { container } = renderWithUi(
      <PersonCell name="রহিমা খাতুন" href="/admin/beneficiaries/1" secondary="বিধবা" />,
      { locale: 'bn' },
    );
    const link = screen.getByRole('link', { name: 'রহিমা খাতুন' });
    expect(link).toHaveAttribute('href', '/admin/beneficiaries/1');
    expect(screen.getByText('বিধবা')).toHaveClass('ui-person-secondary');
    expect(container.querySelector('.ui-icon-tile')).toHaveTextContent('র');
    await expectNoAxeViolations(container);
  });

  it('shows the name as plain text without a link, and no second line when there is none', () => {
    const { container } = renderWithUi(<PersonCell name="Karim Uddin" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Karim Uddin')).toHaveClass('ui-person-name');
    expect(container.querySelector('.ui-person-secondary')).toBeNull();
  });
});
