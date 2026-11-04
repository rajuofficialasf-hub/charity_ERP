import { formatDate } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import {
  Alert,
  Card,
  Chip,
  DataTable,
  IconButton,
  Page,
  Switch,
  Text,
  type DataTableExtendedColumn,
} from '@/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canCreateProjects } from '../roles';
import { StatisticsBar } from '../StatisticsBar';
import { TemplateDialog } from './TemplateDialog';
import { type Template, templates, TEMPLATES_KEY } from './templates-api';
import { LoadError } from '../../components/LoadError';

/**
 * The organisation's project templates (BD-10; DECISION_LOG D-096): everyone who creates projects
 * sees every template, renames and describes it, and deactivates or activates it. A template is
 * made or refilled from a project ("save as template" on the project page) and never deleted.
 */
export function TemplatesPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.templates');
  const tw = useTranslations('admin.projects.workflow');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [inactive, setInactive] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [notice, setNotice] = useState<string>();
  const allowed = Boolean(me && canCreateProjects(me));
  const list = useQuery({
    queryKey: [...TEMPLATES_KEY, inactive],
    queryFn: () => templates(inactive),
    enabled: allowed,
  });
  // the counts read every template, the inactive ones too, whatever the switch shows
  const all = useQuery({
    queryKey: [...TEMPLATES_KEY, true],
    queryFn: () => templates(true),
    enabled: allowed,
  });
  if (!me) return null;
  if (!allowed) return <ForbiddenContent />;

  const name = (row: Template) => localized(row.name, locale);
  const state = (row: Template) => (
    <Chip tone={row.active ? 'success' : 'neutral'}>
      {row.active ? t('state.active') : t('state.inactive')}
    </Chip>
  );
  const updated = (row: Template) =>
    row.updatedByName
      ? t('updated_by', { name: row.updatedByName, date: formatDate(row.updatedAt) })
      : formatDate(row.updatedAt);
  const columns: DataTableExtendedColumn<Template>[] = [
    { id: 'name', header: t('column.name'), cell: name, isRowHeader: true },
    { id: 'workflow', header: t('column.workflow'), cell: (r) => tw(r.workflowKey) },
    { id: 'version', header: t('column.version'), cell: (r) => String(r.version), priority: 2 },
    { id: 'updated', header: t('column.updated'), cell: updated, priority: 2 },
    { id: 'state', header: t('column.state'), cell: state },
  ];
  const edit = (row: Template) => (
    <IconButton
      label={t('edit', { name: name(row) })}
      icon="edit"
      onClick={() => setEditing(row)}
    />
  );

  return (
    <>
      <DocumentTitle title={t('title')} />
      <Page
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={<Switch label={t('show_inactive')} checked={inactive} onChange={setInactive} />}
        documentTitle={false}
      />
      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Alert>
      )}
      {all.data && (
        <StatisticsBar
          label={t('stats.label')}
          items={[
            {
              key: 'active',
              label: t('stats.active'),
              value: all.data.filter((r) => r.active).length,
              icon: 'template',
              tone: 'primary',
            },
            {
              key: 'inactive',
              label: t('stats.inactive'),
              value: all.data.filter((r) => !r.active).length,
              icon: 'block',
            },
          ]}
        />
      )}
      <DataTable
        label={t('table')}
        columns={columns}
        rows={list.data ?? []}
        getRowId={(r) => r.id}
        rowLabel={name}
        loading={list.isPending}
        error={
          list.error ? (
            <LoadError error={list.error} onRetry={() => void list.refetch()} />
          ) : undefined
        }
        emptyTitle={t('empty')}
        rowActions={edit}
        cardRenderer={(r) => (
          <div className="admin-permission-card">
            <strong>{name(r)}</strong>
            <span>{tw(r.workflowKey)}</span>
            <span>{updated(r)}</span>
            {state(r)}
          </div>
        )}
      />
      <Card title={t('rules.title')} headingLevel={2}>
        <Text tone="muted">{t('rules.body')}</Text>
      </Card>
      {editing && (
        <TemplateDialog
          key={editing.id}
          template={editing}
          onClose={() => setEditing(null)}
          onDone={(saved) => {
            setEditing(null);
            setNotice(t('notice.saved', { name: localized(saved.name, locale) }));
            void queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
          }}
        />
      )}
    </>
  );
}
