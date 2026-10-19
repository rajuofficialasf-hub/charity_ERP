import { useTheme } from '@mui/material/styles';
import Button from '@mui/material/Button';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithUi } from '../../testing/render.js';
import { useUi } from '../../provider/UiProvider.js';
import { createUiTheme, SPACING_PX } from './theme.js';
import { TemplateProvider } from './provider.js';

describe('the MUI theme of the set', () => {
  const theme = createUiTheme();

  it('takes the brand colours of colors.md', () => {
    expect(theme.palette.primary.main.toLowerCase()).toBe('#008e48');
    expect(theme.palette.primary.dark.toLowerCase()).toBe('#007b3e');
    expect(theme.palette.primary.contrastText.toLowerCase()).toBe('#ffffff');
    expect(theme.palette.error.main.toLowerCase()).toBe('#c0392b');
    expect(theme.palette.text.primary.toLowerCase()).toBe('#0f2920');
    expect(theme.palette.background.default.toLowerCase()).toBe('#f2f3f7');
  });

  it('uses the brand fonts at 400 and 700 only', () => {
    expect(theme.typography.fontFamily).toBe('UbuntuSans, Bornomala, sans-serif');
    expect(theme.typography.fontWeightRegular).toBe(400);
    expect(theme.typography.fontWeightMedium).toBe(700);
    expect(theme.typography.fontWeightBold).toBe(700);
    expect(theme.typography.button.textTransform).toBe('none');
  });

  it('keeps the radius, the 4 px spacing and the breakpoints of the design system', () => {
    expect(theme.shape.borderRadius).toBe(8);
    expect(SPACING_PX).toBe(4);
    expect(theme.spacing(4)).toBe('calc(4 * var(--mui-spacing, 4px))');
    expect(theme.breakpoints.values).toMatchObject({ sm: 640, md: 1024, lg: 1280 });
  });
});

describe('the template provider', () => {
  it('gives the components inside it the set theme', () => {
    let primary = '';
    function Probe() {
      primary = useTheme().palette.primary.main;
      return null;
    }
    render(
      <TemplateProvider>
        <Probe />
      </TemplateProvider>,
    );
    expect(primary.toLowerCase()).toBe('#008e48');
  });

  it('hands a same-site link to the router instead of loading a page', () => {
    const navigate = vi.fn();
    render(
      <TemplateProvider navigate={navigate}>
        <Button href="/admin/projects">Projects</Button>
        <Button href="https://example.org/elsewhere">Elsewhere</Button>
      </TemplateProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByRole('link', { name: 'Projects' }));
    });
    expect(navigate).toHaveBeenCalledWith('/admin/projects');
    const outside = screen.getByRole('link', { name: 'Elsewhere' });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    outside.dispatchEvent(click);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('leaves a click with a modifier key to the browser', () => {
    const navigate = vi.fn();
    render(
      <TemplateProvider navigate={navigate}>
        <Button href="/admin/projects">Projects</Button>
      </TemplateProvider>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Projects' }), { ctrlKey: true });
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('the set provider', () => {
  it('still refuses a component outside it', () => {
    function Probe() {
      useUi();
      return null;
    }
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/UiProvider/);
  });

  it('renders the set inside the MUI theme', () => {
    let primary = '';
    function Probe() {
      primary = useTheme().palette.primary.main;
      return <p>{useUi().locale}</p>;
    }
    renderWithUi(<Probe />, { locale: 'bn' });
    expect(screen.getByText('bn')).toBeInTheDocument();
    expect(primary.toLowerCase()).toBe('#008e48');
  });
});
