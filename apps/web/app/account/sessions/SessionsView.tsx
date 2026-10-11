'use client';

import type { DeviceSession } from '@css/shared/auth';
import { formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState } from '@css/ui';
import { CircleCheck, Laptop, Smartphone } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { AccountPage } from '../../_components/AccountPage';
import { api, ApiFailure } from '../../_lib/api';

const PLATFORMS = ['android', 'ios', 'desktop', 'other'] as const;

/** My devices (SCR-006 sessions tab, AUTH.md 8): list, current marker, log out another device. */
export function SessionsView() {
  const t = useTranslations('auth.sessions');
  // The list loads only inside the signed-in frame, after the session has been restored.
  return <AccountPage title={() => t('title')}>{() => <SessionList />}</AccountPage>;
}

function SessionList() {
  const t = useTranslations('auth.sessions');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [target, setTarget] = useState<DeviceSession | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    api<DeviceSession[]>('/sessions').then(
      (rows) => {
        if (!active) return;
        setError(null);
        setSessions(rows);
      },
      (failure: unknown) => {
        if (active && failure instanceof ApiFailure) setError(failure);
      },
    );
    return () => {
      active = false;
    };
  }, [version]);

  const platformName = (platform: string | null) => {
    const key = PLATFORMS.find((p) => p === platform) ?? 'other';
    return t(`platform.${key}`);
  };

  const revoke = async () => {
    if (!target) return;
    setPending(true);
    try {
      await api<void>(`/sessions/${target.id}/revoke`, { method: 'POST' });
      setDone(true);
      setTarget(null);
      load();
    } catch (failure) {
      if (failure instanceof ApiFailure) setError(failure);
      setTarget(null);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <p className="m-0">{t('intro')}</p>
      {done && (
        <Alert tone="success" live="status" onDismiss={() => setDone(false)}>
          {t('revoked')}
        </Alert>
      )}
      {error && (
        <ErrorState
          title={tc('state.error.text')}
          message={error.message}
          requestId={error.requestId}
          onRetry={load}
        />
      )}
      {sessions && sessions.length <= 1 && !error && (
        <EmptyState icon={CircleCheck} title={t('empty')} headingLevel={2} />
      )}
      {sessions && (
        <ul className="session-list">
          {sessions.map((session) => (
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
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        isOpen={target !== null}
        title={t('revoke_title')}
        message={t('revoke_body')}
        tone="danger"
        confirmLabel={t('revoke_confirm')}
        pending={pending}
        onConfirm={() => void revoke()}
        onCancel={() => setTarget(null)}
      />
    </>
  );
}
