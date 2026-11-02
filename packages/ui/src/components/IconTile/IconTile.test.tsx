import { screen } from '@testing-library/react';
import { Users } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { renderWithUi } from '../../testing/index.js';
import { IconTile } from './IconTile.js';

describe('IconTile', () => {
  it('shows an icon on the soft square of its tone, hidden from screen readers', () => {
    const { container } = renderWithUi(<IconTile icon={Users} tone="info" />);
    const tile = container.querySelector('.ui-icon-tile');
    expect(tile).toHaveClass('t-info');
    expect(tile).toHaveAttribute('aria-hidden', 'true');
    expect(tile?.querySelector('svg')).not.toBeNull();
  });

  it('shows the first letter of a Bengali name when it has no icon', () => {
    const { container } = renderWithUi(<IconTile name="রহিমা খাতুন" />);
    expect(container.querySelector('.ui-icon-tile')).toHaveTextContent('র');
    expect(container.querySelector('.ui-icon-tile')).toHaveClass('t-brand');
  });

  it('shows a photo in place of the letter', () => {
    const { container } = renderWithUi(<IconTile name="Karim" src="/photo.jpg" />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/photo.jpg');
    expect(screen.queryByText('K')).toBeNull();
  });
});
