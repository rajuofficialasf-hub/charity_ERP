import { formatCount } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { IconButton } from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import { useAuth } from '../../lib/auth';
import { UNREAD_KEY, unreadCount } from './notifications-api';
import './notifications.css';

/** How often the badge asks again while the page is open (one small request a minute). */
const REFRESH_MS = 60_000;

/**
 * The bell of the top bar and the admin bar (docs/ui/SCREENS.md, notifications inbox): opens the
 * inbox; the number of unread entries sits on it and disappears at zero. Only for a signed-in user.
 */
export function NotificationBell() {
  const { me } = useAuth();
  const t = useTranslations('notifications');
  const locale = useLocale() as Locale;
  const unread = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: unreadCount,
    enabled: Boolean(me),
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS / 2,
  });
  if (!me) return null;
  const count = unread.data ?? 0;
  const shown = count > 99 ? `${formatCount(99, locale)}+` : formatCount(count, locale);
  return (
    <span className="notification-bell">
      <IconButton
        label={count > 0 ? t('bell_unread', { count: shown }) : t('bell')}
        icon="bell"
        to="/notifications"
      />
      {count > 0 && (
        <span className="notification-count" aria-hidden="true">
          {shown}
        </span>
      )}
    </span>
  );
}
