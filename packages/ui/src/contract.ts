import type { ComponentType, ReactNode } from 'react';

/**
 * The contract of the component set (the organization's UI rules, recorded in
 * docs/architecture/ADR/ADR-015-mui-core-component-set.md): the props every template implements. Pages see these types through `@css/ui`; the template in
 * src/templates/<name>/ imports them with `import type` and checks itself with
 * `satisfies UiTemplate`, so a template that misses a component or changes its props fails the
 * typecheck. A component's props move here when its implementation moves into the template.
 */

/** The template's own provider: theme, styles and client-side links. */
export interface TemplateProviderProps {
  /** Client-side navigation for same-site links. */
  navigate?: ((href: string) => void) | undefined;
  children: ReactNode;
}

/** Everything a template supplies. */
export interface UiTemplate {
  TemplateProvider: ComponentType<TemplateProviderProps>;
}
