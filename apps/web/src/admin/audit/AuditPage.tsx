import { formatDate, formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Alert,
  Button,
  DateField,
  EmptyState,
  ErrorState,
  Table,
  type TableColumn,
  TableToolbar,
  TextField,
  PageHeader,
} from '@css/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Eye, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canAdministerSystem } from '../roles';
import { useTabView } from '../use-tab-view';
import { type PanelUser, UserSearch } from '../UserSearch';
import { AuditDetail } from './AuditDetail';
import { AUDIT_FILTERS, AUDIT_KEY, type AuditEntry, auditPage } from './audit-api';
import './audit.css';

/** A code typed into a filter, committed when the field is left (not on every key). */
function CodeFilter({
  label,
  helper,
  value,
  pattern,
  onCommit,
}: {
  label: string;
  helper: string;
  value: string | undefined;
  pattern: RegExp;
  onCommit: (value: string | undefined) => void;
}) {
  const [text, setText] = useState(value ?? '');
  const [invalid, setInvalid] = useState(false);
  const [shown, setShown] = useState(value);
  // a filter changed elsewhere (cleared, drill-down) shows its new value
  if (shown !== value) {
    setShown(value);
    setText(value ?? '');
    setInvalid(false);
  }
  const commit = () => {
    const next = text.trim().toLowerCase();
    const valid = next === '' || pattern.test(next);
    setInvalid(!valid);
    if (valid) onCommit(next || undefined);
  };
  return (
    <TextField
      label={label}
      helper={helper}
      lang="en"
      maxLength={100}
      value={text}
      onChange={setText}
      onBlur={commit}
      error={invalid ? helper : undefined}
    />
  );
}

/**
 * The audit log for the Department Head and the Monitoring Team (docs/DECISION_LOG.md, the admin
 * and settings decision of 2026-10-17): newest first, filtered by person, entity, action and dates
 * (the last 30 days unless chosen; a year at most), page by page; an entry opens with the old and
 * new values side by side, and the whole history of its entity is one press away. The filters live
 * in the address, so a reload or a shared link shows the same view.
 */
export function AuditPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.audit');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const { filters, setFilters, change, cursor, setCursor, activeCount } = useTabView(AUDIT_FILTERS);
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const [actor, setActor] = useState<PanelUser | null>(null);
  const allowed = Boolean(me && canAdministerSystem(me));
  const page = useQuery({
    queryKey: [...AUDIT_KEY, filters, cursor],
    queryFn: () => auditPage(filters, cursor),
    enabled: allowed,
    placeholderData: keepPreviousData,
  });
  if (!me) return null;
  if (!allowed) return <ForbiddenContent />;

  const rows = page.data?.data ?? [];
  const meta = page.data?.meta;
  const actorName = (e: AuditEntry) => (e.actor ? e.actor.name : t('system'));
  const columns: TableColumn<AuditEntry>[] = [
    {
      id: 'time',
      header: t('column.time'),
      cell: (e) => formatDateTime(e.createdAt, locale),
      isRowHeader: true,
    },
    { id: 'actor', header: t('column.actor'), cell: actorName },
    { id: 'action', header: t('column.action'), cell: (e) => <code lang="en">{e.action}</code> },
    {
      id: 'entity',
      header: t('column.entity'),
      cell: (e) => <span lang="en">{e.entityType}</span>,
      priority: 2,
    },
    { id: 'reason', header: t('column.reason'), cell: (e) => e.reason ?? '—', priority: 3 },
  ];
  const selectedActor =
    filters.actorUserId === undefined
      ? null
      : actor?.id === filters.actorUserId
        ? actor
        : {
            id: filters.actorUserId,
            displayName:
              rows.find((e) => e.actor?.id === filters.actorUserId)?.actor?.name ??
              t('filter.actor_chosen'),
            designation: null,
            roles: [],
          };
  const rangeError =
    page.error instanceof ApiFailure
      ? page.error.details.find((d) => d.path === 'from')?.message
      : undefined;

  return (
    <>
      <DocumentTitle title={t('title')} />
      <PageHeader
        title={t('title')}
        description={meta && t('range', { from: formatDate(meta.from), to: formatDate(meta.to) })}
      />
      {filters.entityId && (
        <Alert
          tone="info"
          action={
            <Button
              variant="ghost"
              size="sm"
              onPress={() =>
                change({ entityType: undefined, entityId: undefined, from: undefined })
              }
            >
              {t('history_clear')}
            </Button>
          }
        >
          {t('history_of', { type: filters.entityType ?? '', id: filters.entityId })}
        </Alert>
      )}
      <Table
        label={t('table')}
        columns={columns}
        rows={rows}
        rowKey={(e) => e.id}
        rowLabel={(e) => `${formatDateTime(e.createdAt, locale)} ${e.action}`}
        loading={page.isPending}
        error={
          page.error && !rangeError ? (
            <ErrorState
              title={tc('state.error.text')}
              requestId={page.error instanceof ApiFailure ? page.error.requestId : undefined}
              onRetry={() => void page.refetch()}
            />
          ) : undefined
        }
        emptyState={
          <EmptyState icon={ScrollText} title={rangeError ?? t('empty')} headingLevel={2} />
        }
        rowActions={(e) => (
          <Button variant="ghost" size="sm" icon={Eye} iconOnly onPress={() => setOpen(e)}>
            {t('open', { action: e.action })}
          </Button>
        )}
        toolbar={
          <TableToolbar
            activeFilterCount={activeCount()}
            onClearFilters={() => {
              setActor(null);
              setFilters({});
            }}
            filters={
              <>
                <UserSearch
                  label={t('filter.actor')}
                  selected={selectedActor}
                  onSelect={(user) => {
                    setActor(user);
                    change({ actorUserId: user?.id });
                  }}
                />
                <CodeFilter
                  label={t('filter.action')}
                  helper={t('filter.action_hint')}
                  value={filters.action}
                  pattern={/^[a-z_.]{2,100}$/}
                  onCommit={(action) => change({ action })}
                />
                <CodeFilter
                  label={t('filter.entity_type')}
                  helper={t('filter.entity_type_hint')}
                  value={filters.entityType}
                  pattern={/^[a-z_]{2,64}$/}
                  onCommit={(entityType) => change({ entityType, entityId: undefined })}
                />
                <DateField
                  label={t('filter.from')}
                  value={filters.from ?? null}
                  onChange={(from) => change({ from: from ?? undefined })}
                  error={rangeError}
                />
                <DateField
                  label={t('filter.to')}
                  value={filters.to ?? null}
                  onChange={(to) => change({ to: to ?? undefined })}
                />
              </>
            }
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
        cardRenderer={(e) => (
          <div className="admin-permission-card">
            <strong>{formatDateTime(e.createdAt, locale)}</strong>
            <span>{actorName(e)}</span>
            <code lang="en">{e.action}</code>
            <Button variant="secondary" size="sm" onPress={() => setOpen(e)}>
              {t('open_short')}
            </Button>
          </div>
        )}
      />
      {open && (
        <AuditDetail
          entry={open}
          onClose={() => setOpen(null)}
          onHistory={(entityType, entityId) => {
            setOpen(null);
            // the whole history of one entity: the server then looks a year back
            setFilters({ entityType, entityId });
          }}
        />
      )}
    </>
  );
}
