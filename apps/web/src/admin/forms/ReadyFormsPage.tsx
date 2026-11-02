import { localized, type Locale } from '@css/shared/i18n';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  PersonCell,
  Skeleton,
  Stack,
  Table,
  type TableColumn,
  Text,
} from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { FileText, Library, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { BuildersOnly } from './BuildersOnly';
import { READY_KEY, readyForms, type ReadyFormView } from './forms-api';
import { NewReadyFormDialog } from './NewReadyFormDialog';

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
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: READY_KEY, queryFn: readyForms });
  if (list.isPending) return <Skeleton shape="row" count={3} />;
  if (list.error)
    return <ErrorState title={tc('state.error.text')} onRetry={() => void list.refetch()} />;

  const title = (f: ReadyFormView) => localized(f.title, locale);
  const form = (f: ReadyFormView) => (
    <PersonCell
      name={title(f)}
      href={`/admin/ready-forms/${f.id}`}
      secondary={t(`kind.${f.kind}`)}
    />
  );
  const state = (f: ReadyFormView) => (
    <span className="admin-badges">
      {f.publishedVersionNo !== null ? (
        <Badge
          variant="dot"
          tone="success"
          label={tr('state_published', { n: String(f.publishedVersionNo) })}
        />
      ) : (
        <Badge variant="dot" tone="neutral" label={tr('state_draft')} />
      )}
      {f.draftVersionId && f.publishedVersionNo !== null ? (
        <Badge variant="dot" tone="warning" label={tr('has_draft')} />
      ) : null}
    </span>
  );
  const columns: TableColumn<ReadyFormView>[] = [
    { id: 'form', header: tr('column.form'), cell: form, isRowHeader: true },
    { id: 'state', header: tr('column.state'), cell: state },
  ];

  return (
    <>
      <DocumentTitle title={tr('title')} />
      <PageHeader
        eyebrow={tr('eyebrow')}
        title={tr('title')}
        description={tr('intro')}
        actions={
          <Stack direction="row" gap={2} wrap>
            <Button
              variant="secondary"
              icon={Library}
              onPress={() => void navigate('/admin/question-library')}
            >
              {tr('edit_library')}
            </Button>
            <Button icon={Plus} onPress={() => setCreating(true)}>
              {tr('new')}
            </Button>
          </Stack>
        }
      />
      <div className="admin-split">
        <div className="admin-split-main">
          <Table
            layout="panel"
            label={tr('table')}
            columns={columns}
            rows={list.data}
            rowKey={(f) => f.id}
            rowLabel={title}
            emptyState={
              <EmptyState
                icon={FileText}
                title={tr('none')}
                message={tr('none_hint')}
                headingLevel={2}
              />
            }
            cardRenderer={(f) => (
              <div className="admin-permission-card">
                {form(f)}
                {state(f)}
              </div>
            )}
          />
        </div>
        <aside className="admin-split-side" aria-label={tr('steps.title')}>
          <Card accent title={tr('steps.title')} headingLevel={2}>
            <Text tone="muted">{tr('steps.body')}</Text>
          </Card>
        </aside>
      </div>
      <NewReadyFormDialog
        forms={list.data}
        isOpen={creating}
        onClose={() => setCreating(false)}
        onCreated={(formId) => void navigate(`/admin/ready-forms/${formId}`)}
      />
    </>
  );
}
