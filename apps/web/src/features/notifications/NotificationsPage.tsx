import { formatCount, formatDate, formatTime, isoDateInDhaka } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  SegmentedControl,
  Skeleton,
  Tabs,
  Text,
} from '@css/ui';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import {
  type InboxEntry,
  inboxPage,
  markRead,
  NOTIFICATIONS_KEY,
  PREFERENCES_KEY,
  preferences,
  savePreferences,
} from './notifications-api';
import './notifications.css';

/**
 * The own inbox for everyone with an account (docs/ui/SCREENS.md, notifications inbox): all or only unread entries, newest first,
 * grouped by day; an entry opens its record and is then marked read; all can be marked read at
 * once. An official also chooses how emails that can wait reach them.
 */
export function NotificationsPage() {
  const t = useTranslations('notifications');
  const [tab, setTab] = useState('all');
  return (
    <AccountPage title={() => t('title')}>
      {(me) => (
        <>
          <DocumentTitle title={t('title')} />
          <Tabs
            label={t('tab.label')}
            selectedId={tab}
            onChange={setTab}
            items={[
              { id: 'all', label: t('tab.all'), content: <Inbox unread={false} /> },
              { id: 'unread', label: t('tab.unread'), content: <Inbox unread /> },
            ]}
          />
          {me.kind === 'staff' && <EmailPreference />}
        </>
      )}
    </AccountPage>
  );
}

/** The day heading of a group: today, yesterday or the date (Dhaka days). */
function useDayLabel() {
  const t = useTranslations('notifications');
  // the days are fixed when the page opens
  const [{ today, yesterday }] = useState(() => {
    const now = Date.now();
    return {
      today: isoDateInDhaka(new Date(now)),
      yesterday: isoDateInDhaka(new Date(now - 86_400_000)),
    };
  });
  return (day: string) =>
    day === today
      ? t('today')
      : day === yesterday
        ? t('yesterday')
        : formatDate(`${day}T06:00:00Z`);
}

function Inbox({ unread }: { unread: boolean }) {
  const t = useTranslations('notifications');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const dayLabel = useDayLabel();
  const list = useInfiniteQuery({
    queryKey: [...NOTIFICATIONS_KEY, 'list', unread],
    queryFn: ({ pageParam }) => inboxPage(unread, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.meta.nextCursor,
  });
  const read = useMutation({
    mutationFn: markRead,
    // the lists refresh in the background; nothing waits for them
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });

  if (list.isPending) return <Skeleton shape="row" count={4} />;
  if (list.isError) return <ErrorState title={t('error')} onRetry={() => void list.refetch()} />;
  const entries = list.data.pages.flatMap((p) => p.data);
  const unreadCount = list.data.pages[0]?.meta.unreadCount ?? 0;
  if (!entries.length)
    return unread ? (
      <EmptyState icon={Bell} title={t('empty_unread.title')} headingLevel={2} />
    ) : (
      <EmptyState
        icon={Bell}
        title={t('empty.title')}
        message={t('empty.message')}
        headingLevel={2}
      />
    );

  const days: { day: string; items: InboxEntry[] }[] = [];
  for (const e of entries) {
    const day = isoDateInDhaka(e.createdAt);
    const last = days.at(-1);
    if (last?.day === day) last.items.push(e);
    else days.push({ day, items: [e] });
  }
  // the record opens even when marking the entry read fails
  const open = (e: InboxEntry) => {
    if (!e.readAt) read.mutate({ ids: [e.id] });
    // only a path of this app: the server builds it from fixed routes and record ids
    if (e.link && /^\/(?!\/)/.test(e.link)) void navigate(e.link);
  };

  return (
    <div>
      {unreadCount > 0 && (
        <div className="notification-toolbar">
          <Badge tone="info" label={`${t('unread')}: ${formatCount(unreadCount, locale)}`} />
          <Button
            variant="secondary"
            size="sm"
            icon={CheckCheck}
            loading={read.isPending}
            onPress={() => read.mutate({ all: true })}
          >
            {t('mark_all')}
          </Button>
        </div>
      )}
      {read.isError && <Alert tone="danger">{tc('state.error.text')}</Alert>}
      {days.map(({ day, items }) => (
        <section key={day} aria-label={dayLabel(day)}>
          <h2 className="notification-day">{dayLabel(day)}</h2>
          <ul className="notification-list">
            {items.map((e) => (
              <li
                key={e.id}
                className="notification-item"
                data-unread={e.readAt ? 'false' : 'true'}
              >
                <h3>{e.title}</h3>
                <p>{e.body}</p>
                <div className="notification-meta">
                  <span>{formatTime(e.createdAt, locale)}</span>
                  {!e.readAt && <Badge size="sm" tone="brand" label={t('unread')} />}
                  {e.count > 1 && (
                    <Badge size="sm" label={t('times', { count: formatCount(e.count, locale) })} />
                  )}
                </div>
                <div className="notification-actions">
                  {e.link && (
                    <Button size="sm" variant="secondary" onPress={() => open(e)}>
                      {t('open')}
                    </Button>
                  )}
                  {!e.readAt && (
                    <Button size="sm" variant="ghost" onPress={() => read.mutate({ ids: [e.id] })}>
                      {t('mark_read')}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {list.hasNextPage && (
        <Button
          variant="ghost"
          loading={list.isFetchingNextPage}
          onPress={() => void list.fetchNextPage()}
        >
          {t('load_more')}
        </Button>
      )}
    </div>
  );
}

/** How emails that can wait reach an official: at once or in a daily summary. */
function EmailPreference() {
  const t = useTranslations('notifications.email');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const current = useQuery({ queryKey: PREFERENCES_KEY, queryFn: preferences });
  const save = useMutation({
    mutationFn: savePreferences,
    onSuccess: (saved) => queryClient.setQueryData(PREFERENCES_KEY, saved),
  });
  return (
    <Card title={t('title')} headingLevel={2} className="notification-email">
      {current.isPending ? (
        <Skeleton shape="text" />
      ) : current.isError ? (
        <Alert tone="danger">{tc('state.error.text')}</Alert>
      ) : (
        <>
          <SegmentedControl
            label={t('label')}
            options={[
              { id: 'digest', label: t('digest') },
              { id: 'immediate', label: t('immediate') },
            ]}
            value={current.data.email_mode ?? 'digest'}
            onChange={(id) => {
              // one save at a time, so the last answer is the last choice
              if (!save.isPending)
                save.mutate({ email_mode: id === 'immediate' ? 'immediate' : 'digest' });
            }}
          />
          <Text className="admin-muted">{t('help')}</Text>
          {save.isSuccess && <Text role="status">{t('saved')}</Text>}
          {save.isError && <Alert tone="danger">{tc('state.error.text')}</Alert>}
        </>
      )}
    </Card>
  );
}
