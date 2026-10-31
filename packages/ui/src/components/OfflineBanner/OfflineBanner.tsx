'use client';

import { useEffect, useState } from 'react';
import { CircleAlert, CloudOff, RefreshCw, Wifi } from 'lucide-react';
import { fill } from '../../provider/messages.js';
import { useUi } from '../../provider/UiProvider.js';
import { cx } from '../../utils/cx.js';
import { Button } from '../Button/Button.js';
import { Icon } from '../Icon/Icon.js';

export type OfflineState = 'offline' | 'back_online' | 'syncing' | 'sync_failed';

export interface OfflineBannerProps {
  state: OfflineState;
  /** Records waiting in the outbox; shown but not announced on every change. */
  pendingCount?: number;
  onOpenOutbox?: () => void;
  /** Called when "back online" hides itself after 4 seconds. */
  onHidden?: () => void;
  className?: string;
}

const LOOK = {
  offline: { tone: 'neutral', icon: CloudOff },
  back_online: { tone: 'success', icon: Wifi },
  syncing: { tone: 'info', icon: RefreshCw },
  sync_failed: { tone: 'danger', icon: CircleAlert },
} as const;

/** Banner under the app bar for offline and sync states (DESIGN_SYSTEM 5.16). */
export function OfflineBanner({
  state,
  pendingCount,
  onOpenOutbox,
  onHidden,
  className,
}: OfflineBannerProps) {
  const { messages, formatNumber } = useUi();
  const [hiddenFor, setHiddenFor] = useState<OfflineState | null>(null);

  useEffect(() => {
    if (state !== 'back_online') return;
    const timer = setTimeout(() => {
      setHiddenFor('back_online');
      onHidden?.();
    }, 4000);
    return () => clearTimeout(timer);
  }, [state, onHidden]);

  if (hiddenFor === state) return null;
  /* eslint-disable security/detect-object-injection -- typed union key into constant tables */
  const { tone, icon } = LOOK[state];
  const text = {
    offline: messages.offline.offline,
    back_online: messages.offline.backOnline,
    syncing: messages.offline.syncing,
    sync_failed: messages.offline.syncFailed,
  }[state];
  /* eslint-enable security/detect-object-injection */

  // a named landmark of its own, so the count and the button sit inside one (the status text
  // is a live region, not a landmark)
  return (
    <aside
      className={cx('ui-offline', `t-${tone}`, className)}
      aria-label={messages.offline.banner}
    >
      <Icon icon={icon} className={state === 'syncing' ? 'ui-offline-spin' : undefined} />
      {/* Only the state text is live, so count changes are not announced (DESIGN_SYSTEM 5.16). */}
      <p className="ui-offline-text" role="status">
        {text}
      </p>
      {pendingCount !== undefined && pendingCount > 0 && state !== 'back_online' && (
        <span className="ui-offline-count ui-tnum">
          {fill(messages.offline.pending, { count: formatNumber(pendingCount) })}
        </span>
      )}
      {onOpenOutbox && (state === 'sync_failed' || state === 'offline') && (
        <Button variant="ghost" size="sm" onPress={onOpenOutbox}>
          {messages.offline.openOutbox}
        </Button>
      )}
    </aside>
  );
}
