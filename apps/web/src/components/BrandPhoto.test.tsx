import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandPhoto } from './BrandPhoto';

// The building photo beside the sign-in and registration forms: a desktop picture only.
describe('BrandPhoto', () => {
  it('offers the photo to wide windows only, so a phone downloads nothing', () => {
    const { container } = render(<BrandPhoto className="auth-photo" />);
    const sources = [...container.querySelectorAll('source')];
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source.getAttribute('media')).toBe('(min-width: 1024px)');
      expect(source.getAttribute('srcset')).toContain('/brand/building-');
    }
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toMatch(/^data:image\/gif;base64,/);
    expect(img).toHaveAttribute('alt', '');
    expect(container.firstElementChild).toHaveClass('brand-photo', 'auth-photo');
  });
});
