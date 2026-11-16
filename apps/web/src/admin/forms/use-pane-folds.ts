import { useState } from 'react';

/** A side pane of the builder: the questions to add on the left, the settings on the right. */
export type SidePane = 'add' | 'settings';

const KEY = 'css_form_builder_folded';
const PANES: readonly SidePane[] = ['add', 'settings'];

/** The panes the person folded on this device; none where the storage cannot be read. */
function remembered(): readonly SidePane[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(saved) ? PANES.filter((pane) => saved.includes(pane)) : [];
  } catch {
    return [];
  }
}

/**
 * Which side panes of the builder are folded away to give the form their room. The choice is the
 * person's own on this device, a convenience only: where the storage is blocked or full it lasts
 * for this visit.
 */
export function usePaneFolds() {
  const [folded, setFolded] = useState(remembered);
  const toggle = (pane: SidePane) => {
    const next = folded.includes(pane) ? folded.filter((p) => p !== pane) : [...folded, pane];
    setFolded(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // private browsing or a full storage: the panes open unfolded next time
    }
  };
  return { isFolded: (pane: SidePane) => folded.includes(pane), toggle };
}
