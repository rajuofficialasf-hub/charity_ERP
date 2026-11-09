import { localized, type Locale } from '@css/shared/i18n';
import {
  Button,
  Card,
  Chip,
  DataTable,
  Page,
  PersonCell,
  Skeleton,
  Stack,
  Text,
  type DataTableExtendedColumn,
} from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { BuildersOnly } from './BuildersOnly';
import { READY_KEY, readyForms, type ReadyFormView } from './forms-api';
import { NewReadyFormDialog } from './NewReadyFormDialog';
import { LoadError } from '../../components/LoadError';

/**
 * The ready forms the Monitoring Team and the Department Head build outside the projects: each
 * with what it is for and how far it is published, opening its builder; the start of a new one,
 * the way to the question library, which is edited in the same builder, and the steps a form
 * goes through to be published.
 */
export function ReadyFormsPage() {
  return (
    <BuildersOnly>
      <ReadyFormsList />
    </BuildersOnly>
  );
}

function ReadyFormsList() {
  const t = useTranslations('forms.builder');
  const tr = useTranslations('forms.ready');
  const locale = useLocale() as Locale;
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: READY_KEY, queryFn: readyForms });
  if (list.isPending) return <Skeleton shape="row" count={3} />;
  if (list.error) return <LoadError error={list.error} onRetry={() => void list.refetch()} />;

  const title = (f: ReadyFormView) => localized(f.title, locale);
  const form = (f: ReadyFormView) => (
    <PersonCell name={title(f)} to={`/admin/ready-forms/${f.id}`} secondary={t(`kind.${f.kind}`)} />
  );
  const state = (f: ReadyFormView) => (
    <span className="admin-badges">
      {f.publishedVersionNo !== null ? (
        <Chip tone="success">{tr('state_published', { n: String(f.publishedVersionNo) })}</Chip>
      ) : (
        <Chip tone="neutral">{tr('state_draft')}</Chip>
      )}
      {f.draftVersionId && f.publishedVersionNo !== null ? (
        <Chip tone="warning">{tr('has_draft')}</Chip>
      ) : null}
    </span>
  );
  const columns: DataTableExtendedColumn<ReadyFormView>[] = [
    { id: 'form', header: tr('column.form'), cell: form, isRowHeader: true },
    { id: 'state', header: tr('column.state'), cell: state },
  ];

  return (
    <>
      <DocumentTitle title={tr('title')} />
      <Page
        eyebrow={tr('eyebrow')}
        title={tr('title')}
        description={tr('intro')}
        actions={
          <Stack direction="row" gap={2} wrap>
            <Button
              variant="secondary"
              startIcon="library"
              onClick={() => void navigate('/admin/question-library')}
            >
              {tr('edit_library')}
            </Button>
            <Button startIcon="add" onClick={() => setCreating(true)}>
              {tr('new')}
            </Button>
          </Stack>
        }
        documentTitle={false}
      />
      <div className="page-split">
        <div className="page-split-main">
          <DataTable
            label={tr('table')}
            columns={columns}
            rows={list.data}
            getRowId={(f) => f.id}
            rowLabel={title}
            emptyTitle={tr('none')}
            emptyDescription={tr('none_hint')}
            cardRenderer={(f) => (
              <div className="admin-permission-card">
                {form(f)}
                {state(f)}
              </div>
            )}
          />
        </div>
        <aside className="page-split-side" aria-label={tr('steps.title')}>
          <Card title={tr('steps.title')} headingLevel={2}>
            <Text tone="muted">{tr('steps.body')}</Text>
          </Card>
        </aside>
      </div>
      <NewReadyFormDialog
        forms={list.data}
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(formId) => void navigate(`/admin/ready-forms/${formId}`)}
      />
    </>
  );
}
