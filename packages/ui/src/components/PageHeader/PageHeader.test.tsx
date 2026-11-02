import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { Badge } from '../Badge/Badge.js';
import { Button } from '../Button/Button.js';
import { PageHeader } from './PageHeader.js';

describe('PageHeader', () => {
  it('reads the area label, the one h1, the status beside it and the line of purpose in order', async () => {
    const { container } = renderWithUi(
      <PageHeader
        eyebrow="কর্মসূচি ও প্রকল্প"
        title="প্রকল্প"
        meta={<Badge label="চলমান" />}
        description="প্রতিটি প্রকল্পের অবস্থা, সময় ও বাজেট এক জায়গায়"
        actions={<Button>নতুন প্রকল্প</Button>}
      />,
      { locale: 'bn' },
    );
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('প্রকল্প');
    const text = container.querySelector('.ui-page-header')?.textContent ?? '';
    expect(text.indexOf('কর্মসূচি ও প্রকল্প')).toBeLessThan(text.indexOf('চলমান'));
    expect(text.indexOf('চলমান')).toBeLessThan(text.indexOf('প্রতিটি প্রকল্পের'));
    expect(screen.getByRole('button', { name: 'নতুন প্রকল্প' })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('shows the title alone when a page has no area label, description or actions yet', () => {
    const { container } = renderWithUi(<PageHeader title="Audit log" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Audit log' })).toBeInTheDocument();
    expect(container.querySelector('.ui-page-header-eyebrow')).toBeNull();
    expect(container.querySelector('.ui-page-header-description')).toBeNull();
    expect(container.querySelector('.ui-page-header-actions')).toBeNull();
  });
});
