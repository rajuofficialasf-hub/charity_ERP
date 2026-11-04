import { formatCount, formatDate, formatTime, isoDateInDhaka } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Alert, Button, Card, Chip, EmptyState, RadioGroup, Skeleton, Tabs, Text } from '@/ui';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { AccountPage } from '../../components/AccountPage';
import { LoadError } from '../../components/LoadError';
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
    <AccountPage
      title={() => t('title')}
      eyebrow={t('eyebrow')}
      description={t('description')}
      wide
    >
      {(me) => (
        <div className={me.kind === 'staff' ? 'page-split' : undefined}>
          <DocumentTitle title={t('title')} />
          <Card>
            <Tabs
              label={t('tab.label')}
              value={tab}
              onChange={setTab}
              items={[
                { value: 'all', label: t('tab.all'), content: <Inbox unread={false} /> },
                { value: 'unread', label: t('tab.unread'), content: <Inbox unread /> },
              ]}
            />
          </Card>
          {me.kind === 'staff' && (
            <aside className="page-split-side" aria-label={t('email.title')}>
              <EmailPreference />
            </aside>
          )}
        </div>
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
  if (list.isError)
    return <LoadError title={t('error')} error={list.error} onRetry={() => void list.refetch()} />;
  const entries = list.data.pages.flatMap((p) => p.data);
  const unreadCount = list.data.pages[0]?.meta.unreadCount ?? 0;
  if (!entries.length)
    return unread ? (
      <EmptyState title={t('empty_unread.title')} />
    ) : (
      <EmptyState title={t('empty.title')} description={t('empty.message')} />
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
    <div className="notification-inbox">
      {unreadCount > 0 && (
        <div className="notification-toolbar">
          <Chip tone="info">{`${t('unread')}: ${formatCount(unreadCount, locale)}`}</Chip>
          <Button
            variant="secondary"
            size="small"
            startIcon="check"
            loading={read.isPending}
            onClick={() => read.mutate({ all: true })}
          >
            {t('mark_all')}
          </Button>
        </div>
      )}
      {read.isError && <Alert tone="error">{tc('state.error.text')}</Alert>}
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
                  {!e.readAt && <Chip tone="primary">{t('unread')}</Chip>}
                  {e.count > 1 && (
                    <Chip>{t('times', { count: formatCount(e.count, locale) })}</Chip>
                  )}
                </div>
                <div className="notification-actions">
                  {e.link && (
                    <Button size="small" variant="secondary" onClick={() => open(e)}>
                      {t('open')}
                    </Button>
                  )}
                  {!e.readAt && (
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => read.mutate({ ids: [e.id] })}
                    >
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
          variant="text"
          loading={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
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
    <Card title={t('title')} headingLevel={2}>
      {current.isPending ? (
        <Skeleton shape="text" />
      ) : current.isError ? (
        <Alert tone="error">{tc('state.error.text')}</Alert>
      ) : (
        <>
          <RadioGroup
            label={t('label')}
            orientation="horizontal"
            options={[
              { value: 'digest', label: t('digest') },
              { value: 'immediate', label: t('immediate') },
            ]}
            value={current.data.email_mode ?? 'digest'}
            onChange={(id) => {
              // one save at a time, so the last answer is the last choice
              if (!save.isPending)
                save.mutate({ email_mode: id === 'immediate' ? 'immediate' : 'digest' });
            }}
          />
          <Text tone="muted">{t('help')}</Text>
          {save.isSuccess && <Alert tone="success">{t('saved')}</Alert>}
          {save.isError && <Alert tone="error">{tc('state.error.text')}</Alert>}
        </>
      )}
    </Card>
  );
}
