import type { DeviceSession } from '@css/shared/auth';
import { formatCount, formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState } from '@css/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Laptop, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { api, ApiFailure } from '../../lib/api';

const PLATFORMS = ['android', 'ios', 'desktop', 'other'] as const;
const SESSIONS_KEY = ['sessions'] as const;

/** My devices (SCR-006 sessions tab, AUTH.md 8): list, current marker, log out another device. */
export function SessionsView() {
  const t = useTranslations('auth.sessions');
  // The list loads only inside the signed-in frame, after the session has been restored.
  return (
    <AccountPage title={() => t('title')}>
      {() => (
        <>
          <DocumentTitle title={t('title')} />
          <SessionList />
        </>
      )}
    </AccountPage>
  );
}

function SessionList() {
  const t = useTranslations('auth.sessions');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<DeviceSession | null>(null);
  const [done, setDone] = useState(false);

  const sessions = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: () => api<DeviceSession[]>('/sessions'),
  });
  const revoke = useMutation({
    mutationFn: (session: DeviceSession) =>
      api<void>(`/sessions/${session.id}/revoke`, { method: 'POST' }),
    onSuccess: () => setDone(true),
    onSettled: () => {
      setTarget(null);
      void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
  });

  const platformName = (platform: string | null) => {
    const key = PLATFORMS.find((p) => p === platform) ?? 'other';
    return t(`platform.${key}`);
  };
  const failure = [sessions.error, revoke.error].find((e) => e instanceof ApiFailure);
  const rows = sessions.data;
  /** What the device last said it still holds, or null when it never said. */
  const pendingOf = (session: DeviceSession, key: 'pending' | 'revoke_pending') =>
    session.pendingCount && session.pendingReportedAt
      ? t(key, {
          n: session.pendingCount,
          count: formatCount(session.pendingCount, locale),
          time: formatDateTime(session.pendingReportedAt, locale),
        })
      : null;

  return (
    <>
      {done && (
        <Alert tone="success" live="status" onDismiss={() => setDone(false)}>
          {t('revoked')}
        </Alert>
      )}
      {failure && (
        <ErrorState
          title={tc('state.error.text')}
          message={failure.message}
          requestId={failure.requestId}
          onRetry={() => {
            revoke.reset();
            void sessions.refetch();
          }}
        />
      )}
      {rows && rows.length <= 1 && !failure && (
        <EmptyState icon={CircleCheck} title={t('empty')} headingLevel={2} />
      )}
      {rows && (
        <ul className="session-list">
          {rows.map((session) => (
            <li key={session.id}>
              <Card
                title={session.deviceName ?? t('unknown_device')}
                subtitle={platformName(session.platform)}
                headingLevel={2}
                actions={
                  session.current ? (
                    <Badge tone="success" icon={CircleCheck} label={t('current')} />
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={session.platform === 'desktop' ? Laptop : Smartphone}
                      onPress={() => setTarget(session)}
                    >
                      {t('revoke')}
                    </Button>
                  )
                }
              >
                <div className="session-row">
                  <p>{t('last_seen', { time: formatDateTime(session.lastSeenAt, locale) })}</p>
                  <p>{t('created', { date: formatDateTime(session.createdAt, locale) })}</p>
                  {pendingOf(session, 'pending') && <p>{pendingOf(session, 'pending')}</p>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        isOpen={target !== null}
        title={t('revoke_title')}
        message={
          <>
            <p>{t('revoke_body')}</p>
            {target && pendingOf(target, 'revoke_pending') && (
              <p>{pendingOf(target, 'revoke_pending')}</p>
            )}
          </>
        }
        tone="danger"
        confirmLabel={t('revoke_confirm')}
        pending={revoke.isPending}
        onConfirm={() => target && revoke.mutate(target)}
        onCancel={() => setTarget(null)}
      />
    </>
  );
}
