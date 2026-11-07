import type { ExtendedIconName, ExtendedIconProps } from '@/ui/contract';

import { useEffect, useSyncExternalStore } from 'react';

// ----------------------------------------------------------------------

// The drawings of every icon are one file the first page does not wait for: it loads with the
// first icon drawn, and every icon fills in at once when it arrives.
let bodies: Readonly<Record<ExtendedIconName, string>> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Loads the icon drawings once; resolves when every icon can draw. */
export function loadIcons(): Promise<void> {
  loading ??= import('./icon-data').then((module) => {
    bodies = module.iconBodies;
    listeners.forEach((listener) => listener());
  });
  return loading;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const current = () => bodies;

/** A Solar duotone icon in the current text colour. Decorative unless `label` is given. */
export function Icon({ name, label, size = 24 }: ExtendedIconProps) {
  const drawings = useSyncExternalStore(subscribe, current, current);
  useEffect(() => {
    if (!drawings) void loadIcons();
  }, [drawings]);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      focusable="false"
      style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' }}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      // The bodies are fixed SVG from the generated icon-data.ts, never user input.
      dangerouslySetInnerHTML={{ __html: drawings?.[name] ?? '' }}
    />
  );
}
