import type { DeviceSession } from '@css/shared/auth';
import { formatCount, formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Alert, Button, ConfirmDialog, ErrorState, Grid, Skeleton, Stack, Text } from '@css/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { revokeUserSession, userSessions, VOLUNTEERS_KEY } from './volunteers-api';

/**
 * The devices a volunteer is signed in on, for an official who may sign them out (a lost phone,
 * `session.revoke_user`); each sign-out needs a reason and is audited by the server.
 */
export function VolunteerSessions({ userId, canRevoke }: { userId: string; canRevoke: boolean }) {
  const t = useTranslations('admin.volunteers.profile');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const key = [...VOLUNTEERS_KEY, 'sessions', userId];
  const [target, setTarget] = useState<DeviceSession | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sessions = useQuery({ queryKey: key, queryFn: () => userSessions(userId) });
  const revoke = useMutation({
    mutationFn: (reason: string) => revokeUserSession(userId, target!.id, reason.trim()),
    onSuccess: () => {
      setTarget(null);
      revoke.reset();
      setNotice(t('revoked'));
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
  if (sessions.isPending) return <Skeleton count={2} />;
  if (sessions.error)
    return (
      <ErrorState
        title={tc('state.error.text')}
        requestId={sessions.error instanceof ApiFailure ? sessions.error.requestId : undefined}
        onRetry={() => void sessions.refetch()}
      />
    );
  const device = (s: DeviceSession) => s.deviceName ?? t('unknown_device');
  /** What the device last said it still holds, or null when it never said. */
  const pendingOf = (s: DeviceSession, key: 'pending' | 'revoke_pending') =>
    s.pendingCount && s.pendingReportedAt
      ? t(key, {
          n: s.pendingCount,
          count: formatCount(s.pendingCount, locale),
          time: formatDateTime(s.pendingReportedAt, locale),
        })
      : null;
  const failure = revoke.error instanceof ApiFailure ? revoke.error : null;
  return (
    <>
      {notice && (
        <Alert tone="success" live="status" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {sessions.data.length === 0 ? (
        <Text className="admin-muted">{t('no_sessions')}</Text>
      ) : (
        <Grid gap={2} as="ul" role="list">
          {sessions.data.map((s) => (
            <Stack direction="row" wrap align="center" gap={2} as="li" key={s.id}>
              <strong>{device(s)}</strong>
              <span className="admin-muted">
                {t('last_seen', { date: formatDateTime(s.lastSeenAt, locale) })}
              </span>
              {pendingOf(s, 'pending') !== null && (
                <span className="admin-muted">{pendingOf(s, 'pending')}</span>
              )}
              {canRevoke && (
                <Button size="sm" variant="secondary" icon={LogOut} onPress={() => setTarget(s)}>
                  {t('revoke')}
                </Button>
              )}
            </Stack>
          ))}
        </Grid>
      )}
      <ConfirmDialog
        isOpen={target !== null}
        title={target ? t('revoke_title', { device: device(target) }) : ''}
        message={
          <>
            {target && pendingOf(target, 'revoke_pending') && (
              <p>{pendingOf(target, 'revoke_pending')}</p>
            )}
            {failure && (
              <p className="admin-error">{failure.details[0]?.message ?? failure.message}</p>
            )}
          </>
        }
        tone="danger"
        reasonRequired
        reasonLabel={t('revoke_reason')}
        confirmLabel={t('revoke_confirm')}
        pending={revoke.isPending}
        onConfirm={(reason) => revoke.mutate(reason)}
        onCancel={() => {
          revoke.reset();
          setTarget(null);
        }}
      />
    </>
  );
}
