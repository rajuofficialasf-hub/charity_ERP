import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { ThemeProvider } from '@mui/material/styles';
import { forwardRef, useMemo, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import type { TemplateProviderProps } from '../../contract.js';
import { createUiTheme } from './theme.js';

/**
 * Emotion's styles go first in the document head, so the set's base CSS and the pages' own CSS
 * (loaded as stylesheets) keep their precedence over MUI's defaults.
 */
const emotionCache = createCache({ key: 'mui', prepend: true });

/** A plain click on a same-site link: the router handles it instead of a page load. */
function isClientNavigation(event: MouseEvent<HTMLAnchorElement>, href: string | undefined) {
  if (!href || event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return false;
  const target = event.currentTarget.getAttribute('target');
  if (target && target !== '_self') return false;
  return href.startsWith('/') && !href.startsWith('//');
}

/** An anchor that hands same-site navigation to the app's router. */
function routerLink(navigate: (href: string) => void) {
  const RouterLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(
    function RouterLink({ href, onClick, ...props }, ref) {
      return (
        <a
          ref={ref}
          href={href}
          {...props}
          onClick={(event) => {
            onClick?.(event);
            if (!isClientNavigation(event, href)) return;
            event.preventDefault();
            navigate(href!);
          }}
        />
      );
    },
  );
  return RouterLink;
}

/** The MUI theme and Emotion cache of the set; links navigate through the app's router. */
export function TemplateProvider({ navigate, children }: TemplateProviderProps) {
  const theme = useMemo(
    () => createUiTheme(navigate ? routerLink(navigate) : undefined),
    [navigate],
  );
  return (
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </CacheProvider>
  );
}
