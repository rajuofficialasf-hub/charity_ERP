import { formatDate } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Switch,
  Table,
  type TableColumn,
  PageHeader,
} from '@css/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutTemplate, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canCreateProjects } from '../roles';
import { TemplateDialog } from './TemplateDialog';
import { type Template, templates, TEMPLATES_KEY } from './templates-api';

/**
 * The organisation's project templates (BD-10; DECISION_LOG D-096): everyone who creates projects
 * sees every template, renames and describes it, and deactivates or activates it. A template is
 * made or refilled from a project ("save as template" on the project page) and never deleted.
 */
export function TemplatesPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.templates');
  const tw = useTranslations('admin.projects.workflow');
  const tc = useTranslations('common');
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
  if (!me) return null;
  if (!allowed) return <ForbiddenContent />;

  const name = (row: Template) => localized(row.name, locale);
  const state = (row: Template) => (
    <Badge
      tone={row.active ? 'success' : 'neutral'}
      label={row.active ? t('state.active') : t('state.inactive')}
    />
  );
  const updated = (row: Template) =>
    row.updatedByName
      ? t('updated_by', { name: row.updatedByName, date: formatDate(row.updatedAt) })
      : formatDate(row.updatedAt);
  const columns: TableColumn<Template>[] = [
    { id: 'name', header: t('column.name'), cell: name, isRowHeader: true },
    { id: 'workflow', header: t('column.workflow'), cell: (r) => tw(r.workflowKey) },
    { id: 'version', header: t('column.version'), cell: (r) => String(r.version), priority: 2 },
    { id: 'updated', header: t('column.updated'), cell: updated, priority: 2 },
    { id: 'state', header: t('column.state'), cell: state },
  ];
  const edit = (row: Template) => (
    <Button variant="ghost" size="sm" icon={Pencil} iconOnly onPress={() => setEditing(row)}>
      {t('edit', { name: name(row) })}
    </Button>
  );

  return (
    <>
      <DocumentTitle title={t('title')} />
      <PageHeader
        title={t('title')}
        actions={
          <Switch isSelected={inactive} onChange={setInactive}>
            {t('show_inactive')}
          </Switch>
        }
      />
      {notice && (
        <Alert tone="success" live="status" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Alert>
      )}
      <Table
        label={t('table')}
        columns={columns}
        rows={list.data ?? []}
        rowKey={(r) => r.id}
        rowLabel={name}
        loading={list.isPending}
        error={
          list.error ? (
            <ErrorState
              title={tc('state.error.text')}
              requestId={list.error instanceof ApiFailure ? list.error.requestId : undefined}
              onRetry={() => void list.refetch()}
            />
          ) : undefined
        }
        emptyState={<EmptyState icon={LayoutTemplate} title={t('empty')} headingLevel={2} />}
        rowActions={edit}
        cardRenderer={(r) => (
          <div className="admin-permission-card">
            <strong>{name(r)}</strong>
            <span>{tw(r.workflowKey)}</span>
            <span>{updated(r)}</span>
            {state(r)}
            <Button variant="secondary" size="sm" onPress={() => setEditing(r)}>
              {tc('action.edit')}
            </Button>
          </div>
        )}
      />
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
