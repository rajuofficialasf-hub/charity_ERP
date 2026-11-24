import { formatDate, formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Alert,
  Button,
  Card,
  Chip,
  DataTable,
  type DataTableExtendedColumn,
  DateField,
  FilterBar,
  IconButton,
  Page,
  PersonCell,
  Text,
  TextField,
} from '@/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../api/client';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canOversee } from '../roles';
import { useTabView } from '../use-tab-view';
import { type PanelUser, UserSearch } from '../UserSearch';
import { AuditDetail } from './AuditDetail';
import { AUDIT_FILTERS, AUDIT_KEY, type AuditEntry, auditPage } from './audit-api';
import './audit.css';
import { LoadError } from '../../components/LoadError';
import { useCountLine } from '../list-paging';

/** A code typed into a filter, committed when the field is left (not on every key). */
function CodeFilter({
  label,
  hint,
  value,
  pattern,
  onCommit,
}: {
  label: string;
  hint: string;
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
    // Enter applies the filter, as leaving the field does
    <div
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
        event.preventDefault();
        commit();
      }}
    >
      <TextField
        label={label}
        hint={hint}
        lang="en"
        maxLength={100}
        value={text}
        onChange={setText}
        onBlur={commit}
        error={invalid ? hint : undefined}
      />
    </div>
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
  const locale = useLocale() as Locale;
  const { filters, setFilters, change, cursor, setCursor } = useTabView(AUDIT_FILTERS);
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const [actor, setActor] = useState<PanelUser | null>(null);
  const allowed = Boolean(me && canOversee(me));
  const page = useQuery({
    queryKey: [...AUDIT_KEY, filters, cursor],
    queryFn: () => auditPage(filters, cursor),
    enabled: allowed,
    placeholderData: keepPreviousData,
  });
  const countLine = useCountLine();
  if (!me) return null;
  if (!allowed) return <ForbiddenContent />;

  const rows = page.data?.data ?? [];
  const meta = page.data?.meta;
  const actorName = (e: AuditEntry) => (e.actor ? e.actor.name : t('system'));
  const columns: DataTableExtendedColumn<AuditEntry>[] = [
    {
      id: 'time',
      header: t('column.time'),
      cell: (e) => formatDateTime(e.createdAt, locale),
      isRowHeader: true,
    },
    { id: 'actor', header: t('column.actor'), cell: (e) => <PersonCell name={actorName(e)} /> },
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
      <Page
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        documentTitle={false}
      />
      {/* the range of days the server read, right under the heading */}
      {meta && (
        <div>
          <Chip tone="neutral">
            {t('range', { from: formatDate(meta.from), to: formatDate(meta.to) })}
          </Chip>
        </div>
      )}
      <Card title={t('note.title')} headingLevel={2}>
        <Text tone="muted">{t('note.body')}</Text>
      </Card>
      {filters.entityId && (
        <Alert
          tone="info"
          action={
            <Button
              variant="text"
              size="small"
              onClick={() =>
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
      <DataTable
        label={t('table')}
        columns={columns}
        rows={rows}
        getRowId={(e) => e.id}
        rowLabel={(e) => `${formatDateTime(e.createdAt, locale)} ${e.action}`}
        loading={page.isPending}
        error={
          page.error && !rangeError ? (
            <LoadError error={page.error} onRetry={() => void page.refetch()} />
          ) : undefined
        }
        emptyTitle={rangeError ?? t('empty')}
        rowActions={(e) => (
          <IconButton
            label={t('open', { action: e.action })}
            icon="eye"
            onClick={() => setOpen(e)}
          />
        )}
        toolbar={
          <FilterBar
            onClearFilters={() => {
              setActor(null);
              setFilters({});
            }}
          >
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
                hint={t('filter.action_hint')}
                value={filters.action}
                pattern={/^[a-z_.]{2,100}$/}
                onCommit={(action) => change({ action })}
              />
              <CodeFilter
                label={t('filter.entity_type')}
                hint={t('filter.entity_type_hint')}
                value={filters.entityType}
                pattern={/^[a-z_]{2,64}$/}
                onCommit={(entityType) => change({ entityType, entityId: undefined })}
              />
              <DateField
                label={t('filter.from')}
                value={filters.from ?? ''}
                onChange={(from) => change({ from: from || undefined })}
                error={rangeError}
              />
              <DateField
                label={t('filter.to')}
                value={filters.to ?? ''}
                onChange={(to) => change({ to: to || undefined })}
              />
            </>
          </FilterBar>
        }
        cursorPagination={
          meta
            ? {
                hasNext: meta.nextCursor !== null,
                hasPrevious: meta.prevCursor !== null,
                onNext: () => setCursor(meta.nextCursor),
                onPrevious: () => setCursor(meta.prevCursor),
                summary: countLine(rows.length, meta.nextCursor ? 'more' : rows.length),
              }
            : undefined
        }
        cardRenderer={(e) => (
          <div className="admin-permission-card">
            <strong>{formatDateTime(e.createdAt, locale)}</strong>
            <span>{actorName(e)}</span>
            <code lang="en">{e.action}</code>
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
