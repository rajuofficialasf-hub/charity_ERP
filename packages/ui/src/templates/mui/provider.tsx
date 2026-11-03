import { StyledEngineProvider, ThemeProvider, type Theme } from '@mui/material/styles';
import {
  createContext,
  forwardRef,
  useContext,
  useMemo,
  type AnchorHTMLAttributes,
  type ComponentType,
  type MouseEvent,
} from 'react';
import type { TemplateProviderProps } from '../../contract.js';
import { createUiTheme } from './theme.js';

/** The app's router, for the links of the set. */
const NavigateContext = createContext<((href: string) => void) | undefined>(undefined);

/**
 * The set's own theme. The app's newer UI system provides its theme inside this provider, so each
 * MUI component of the set takes this one back through `inSetTheme` and keeps its look and its
 * routed links (docs/architecture/ADR/ADR-016-asf-ui-system.md, the move off this set).
 */
const SetThemeContext = createContext<Theme | null>(null);

/** The component, drawn with the set's theme whatever theme is nearer to it. */
export function inSetTheme<P extends object>(Component: ComponentType<P>): ComponentType<P> {
  function InSetTheme(props: P) {
    const theme = useContext(SetThemeContext);
    return theme ? (
      <ThemeProvider theme={theme}>
        <Component {...props} />
      </ThemeProvider>
    ) : (
      <Component {...props} />
    );
  }
  InSetTheme.displayName = `InSetTheme(${Component.displayName ?? Component.name})`;
  return InSetTheme;
}

/** A plain click on a same-site link: the router handles it instead of a page load. */
function isClientNavigation(event: MouseEvent<HTMLAnchorElement>, href: string | undefined) {
  if (!href || event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return false;
  const target = event.currentTarget.getAttribute('target');
  if (target && target !== '_self') return false;
  return href.startsWith('/') && !href.startsWith('//');
}

/**
 * An anchor that hands same-site navigation to the app's router. It is one component type for
 * the whole app and reads the current router from the provider, so a caller that passes a new
 * `navigate` on every render never rebuilds the theme or remounts the links.
 */
export const RouterLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(
  function RouterLink({ href, onClick, ...props }, ref) {
    const navigate = useContext(NavigateContext);
    return (
      <a
        ref={ref}
        href={href}
        {...props}
        onClick={(event) => {
          onClick?.(event);
          if (!navigate || !isClientNavigation(event, href)) return;
          event.preventDefault();
          navigate(href!);
        }}
      />
    );
  },
);

/** The MUI theme and style engine of the set; links navigate through the app's router. */
export function TemplateProvider({ navigate, children }: TemplateProviderProps) {
  const routed = navigate !== undefined;
  const theme = useMemo(() => createUiTheme(routed ? RouterLink : undefined), [routed]);
  return (
    // MUI's styles go into the `mui` cascade layer, which the page declares under the design
    // system's components and the pages' own rules (apps/web/index.html), so those keep winning
    <StyledEngineProvider enableCssLayer>
      <NavigateContext.Provider value={navigate}>
        <SetThemeContext.Provider value={theme}>
          <ThemeProvider theme={theme}>{children}</ThemeProvider>
        </SetThemeContext.Provider>
      </NavigateContext.Provider>
    </StyledEngineProvider>
  );
}
