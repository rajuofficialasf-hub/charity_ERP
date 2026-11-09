import { Breadcrumbs } from '@/ui';
import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';

/** A step of a page's trail; `href` is the earlier pages' name for the address. */
export interface TrailItem {
  id?: string;
  label: string;
  to?: string;
  href?: string;
}

/**
 * The page's own crumbs and where they show (docs/ui/DESIGN_SYSTEM.md, section "Breadcrumb"):
 * beside an official's sidebar the header draws the trail, so a page only hands its crumbs up;
 * on a phone or a tablet, and outside the shell, the page draws them itself.
 */
interface Crumbs {
  inBar: boolean;
  set: (items: TrailItem[] | null) => void;
}

const CrumbsContext = createContext<Crumbs | null>(null);

/** Holds the crumbs the page hands up while the header draws the trail. */
export function useCrumbsHolder(inBar: boolean) {
  const [items, set] = useState<TrailItem[] | null>(null);
  return { items: inBar ? items : null, value: { inBar, set } };
}

export function CrumbsProvider({ value, children }: { value: Crumbs; children: ReactNode }) {
  return <CrumbsContext.Provider value={value}>{children}</CrumbsContext.Provider>;
}

/** A page's own crumbs: handed to the header beside the sidebar, drawn in place elsewhere. */
export function PageCrumbs({ items }: { items: TrailItem[] }) {
  const crumbs = useContext(CrumbsContext);
  const inBar = crumbs?.inBar ?? false;
  const set = crumbs?.set;
  // the items are compared by their text, so a new array with the same crumbs changes nothing;
  // they reach the header before the page is painted, so its trail never shows the shorter one
  const key = JSON.stringify(items);
  useLayoutEffect(() => {
    if (!inBar || !set) return;
    set(JSON.parse(key) as TrailItem[]);
    return () => set(null);
  }, [inBar, set, key]);
  return inBar ? null : (
    <Breadcrumbs items={items.map((item) => ({ label: item.label, to: item.to ?? item.href }))} />
  );
}
