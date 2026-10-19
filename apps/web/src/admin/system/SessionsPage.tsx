import { formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Stack,
  Table,
  type TableColumn,
  TableToolbar,
} from '@css/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, MonitorSmartphone } from 'lucide-react';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canAdministerSystem } from '../roles';
import { useTabView } from '../use-tab-view';
import { type ActiveSession, activeSessions, endSession, SESSIONS_KEY } from './system-api';

const KINDS = ['staff', 'volunteer'] as const;

/**
 * Every active device session for the Department Head and the Monitoring Team (docs/DECISION_LOG.md,
 * the admin and settings decision of 2026-10-17): newest started first, a search by person and the
 * account kind; a session is ended with a reason, and the server keeps the Main Admin's sessions
 * for the Main Admin.
 */
export function SessionsPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.sessions');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const { filters, change, q, onSearch, cursor, setCursor } = useTabView(['kind'] as const);
  const [target, setTarget] = useState<ActiveSession | null>(null);
  const [notice, setNotice] = useState<string>();
  // a stale or edited link with another kind shows every session instead of an error
  const kind = KINDS.find((k) => k === filters.kind);
  const allowed = Boolean(me && canAdministerSystem(me));
  const page = useQuery({
    queryKey: [...SESSIONS_KEY, kind, q, cursor],
    queryFn: () => activeSessions(q, kind, cursor),
    enabled: allowed,
    placeholderData: keepPreviousData,
  });
  const end = useMutation({
    mutationFn: ({ session, reason }: { session: ActiveSession; reason: string }) =>
      endSession(session.person.id, session.id, reason.trim()),
    onSuccess: (_, { session }) => {
      setNotice(t('ended', { name: session.person.name }));
      setTarget(null);
      end.reset();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
  if (!me) return null;
  if (!allowed) return <ForbiddenContent />;

  const rows = page.data?.data ?? [];
  const meta = page.data?.meta;
  const device = (s: ActiveSession) =>
    [s.deviceName ?? t('unknown_device'), s.platform].filter(Boolean).join(' · ');
  const person = (s: ActiveSession) => (
    <Stack direction="row" wrap align="center" gap={2} as="span">
      <strong>{s.person.name}</strong>
      {s.person.systemOwner && <Badge tone="info" label={t('main_admin')} />}
    </Stack>
  );
  const columns: TableColumn<ActiveSession>[] = [
    { id: 'person', header: t('column.person'), cell: person, isRowHeader: true },
    { id: 'kind', header: t('column.kind'), cell: (s) => t(`kind.${s.person.kind}`), priority: 2 },
    { id: 'device', header: t('column.device'), cell: device },
    { id: 'version', header: t('column.version'), cell: (s) => s.appVersion ?? '—', priority: 3 },
    {
      id: 'seen',
      header: t('column.last_seen'),
      cell: (s) => formatDateTime(s.lastSeenAt, locale),
    },
    {
      id: 'started',
      header: t('column.started'),
      cell: (s) => formatDateTime(s.createdAt, locale),
      priority: 3,
    },
  ];
  const failure = end.error instanceof ApiFailure ? end.error : null;
  const ask = (s: ActiveSession) => {
    end.reset();
    setTarget(s);
  };

  return (
    <>
      <DocumentTitle title={t('title')} />
      <h1 className="admin-title">{t('title')}</h1>
      <p className="admin-muted">{t('intro')}</p>
      {notice && (
        <Alert tone="success" live="status" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Alert>
      )}
      <Table
        label={t('table')}
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        rowLabel={(s) => `${s.person.name} ${device(s)}`}
        loading={page.isPending}
        error={
          page.error ? (
            <ErrorState
              title={tc('state.error.text')}
              requestId={page.error instanceof ApiFailure ? page.error.requestId : undefined}
              onRetry={() => void page.refetch()}
            />
          ) : undefined
        }
        emptyState={<EmptyState icon={MonitorSmartphone} title={t('empty')} headingLevel={2} />}
        rowActions={(s) => (
          <Button variant="ghost" size="sm" icon={LogOut} iconOnly onPress={() => ask(s)}>
            {t('end', { name: s.person.name, device: device(s) })}
          </Button>
        )}
        toolbar={
          <TableToolbar
            onSearch={onSearch}
            searchPlaceholder={t('search')}
            chips={[
              { id: 'all', label: t('kind.all') },
              ...KINDS.map((k) => ({ id: k, label: t(`kind.${k}`) })),
            ]}
            activeChip={kind ?? 'all'}
            onChipChange={(id) => change({ kind: id === 'all' ? undefined : id })}
          />
        }
        pagination={
          meta
            ? {
                shown: rows.length,
                // no total for this list: "25+" while another page follows
                total: meta.nextCursor ? `${rows.length}+` : rows.length,
                hasNext: meta.nextCursor !== null,
                hasPrevious: meta.prevCursor !== null,
                onNext: () => setCursor(meta.nextCursor),
                onPrevious: () => setCursor(meta.prevCursor),
              }
            : undefined
        }
        cardRenderer={(s) => (
          <div className="admin-permission-card">
            {person(s)}
            <span>{device(s)}</span>
            <span>{t('seen_at', { date: formatDateTime(s.lastSeenAt, locale) })}</span>
            <Button variant="secondary" size="sm" icon={LogOut} onPress={() => ask(s)}>
              {t('end_short')}
            </Button>
          </div>
        )}
      />
      <ConfirmDialog
        isOpen={target !== null}
        title={target ? t('end_title', { name: target.person.name, device: device(target) }) : ''}
        message={
          failure && <p className="admin-error">{failure.details[0]?.message ?? failure.message}</p>
        }
        tone="danger"
        reasonRequired
        reasonLabel={t('reason')}
        confirmLabel={t('end_short')}
        pending={end.isPending}
        onConfirm={(reason) => target && end.mutate({ session: target, reason })}
        onCancel={() => {
          end.reset();
          setTarget(null);
        }}
      />
    </>
  );
}
