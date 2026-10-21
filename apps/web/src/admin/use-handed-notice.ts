import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

/** A message one page hands to the next through the router state (a merge leads to the kept profile). */
export interface HandedNotice {
  notice?: string;
}

/**
 * The success notice of a page: the one handed over by the page that led here, shown once, or any
 * message the page sets itself. Dismissing it clears the router state, so a reload does not show
 * the handed-over message again.
 */
export function useHandedNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<string | null>(
    () => (location.state as HandedNotice | null)?.notice ?? null,
  );
  const dismiss = () => {
    setNotice(null);
    if (location.state) void navigate(location.pathname, { replace: true, state: null });
  };
  return { notice, setNotice, dismiss };
}
