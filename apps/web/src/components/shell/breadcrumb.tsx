import { Breadcrumb, type BreadcrumbItem } from '@css/ui';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * The page's own crumbs and where they show (docs/ui/DESIGN_SYSTEM.md, section "Breadcrumb"):
 * beside an official's sidebar the app bar draws the trail, so a page only hands its crumbs up;
 * on a phone or a tablet, and outside the shell, the page draws them itself, with the back link.
 */
interface Crumbs {
  inBar: boolean;
  set: (items: BreadcrumbItem[] | null) => void;
}

const CrumbsContext = createContext<Crumbs | null>(null);

/** Holds the crumbs the page hands up while the app bar draws the trail. */
export function useCrumbsHolder(inBar: boolean) {
  const [items, set] = useState<BreadcrumbItem[] | null>(null);
  return { items: inBar ? items : null, value: { inBar, set } };
}

export function CrumbsProvider({ value, children }: { value: Crumbs; children: ReactNode }) {
  return <CrumbsContext.Provider value={value}>{children}</CrumbsContext.Provider>;
}

/** A page's own crumbs: handed to the app bar beside the sidebar, drawn in place elsewhere. */
export function PageCrumbs({ items }: { items: BreadcrumbItem[] }) {
  const crumbs = useContext(CrumbsContext);
  const inBar = crumbs?.inBar ?? false;
  const set = crumbs?.set;
  // the items are compared by their text, so a new array with the same crumbs changes nothing
  const key = JSON.stringify(items);
  useEffect(() => {
    if (!inBar || !set) return;
    set(JSON.parse(key) as BreadcrumbItem[]);
    return () => set(null);
  }, [inBar, set, key]);
  return inBar ? null : <Breadcrumb items={items} />;
}
