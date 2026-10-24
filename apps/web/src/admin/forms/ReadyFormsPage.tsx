import { localized, type Locale } from '@css/shared/i18n';
import { Badge, Button, EmptyState, ErrorState, Skeleton, Stack, Text } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { READY_KEY, readyForms } from './forms-api';
import { NewReadyFormDialog } from './NewReadyFormDialog';

/**
 * The ready forms the Monitoring Team and the Department Head build outside the projects: each
 * with what it is for and how far it is published, opening its builder; the start of a new one,
 * and the way to the question library, which is edited in the same builder.
 */
export function ReadyFormsPage() {
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
  return (
    <>
      <DocumentTitle title={tr('title')} />
      <div className="admin-title-row">
        <h1 className="admin-title">{tr('title')}</h1>
        <Stack direction="row" gap={2} wrap>
          <Button variant="secondary" onPress={() => void navigate('/admin/question-library')}>
            {tr('edit_library')}
          </Button>
          <Button onPress={() => setCreating(true)}>{tr('new')}</Button>
        </Stack>
      </div>
      <Text tone="muted">{tr('intro')}</Text>
      {list.data.length === 0 ? (
        <EmptyState title={tr('none')} message={tr('none_hint')} />
      ) : (
        <Stack as="ul" gap={2}>
          {list.data.map((f) => {
            const title = localized(f.title, locale);
            return (
              <li key={f.id}>
                <Link to={`/admin/ready-forms/${f.id}`}>{tr('open', { title })}</Link>
                <Stack direction="row" gap={2} wrap align="center">
                  <Badge label={t(`kind.${f.kind}`)} />
                  <Text tone="muted">
                    {f.publishedVersionNo !== null
                      ? tr('state_published', { n: String(f.publishedVersionNo) })
                      : tr('state_draft')}
                  </Text>
                  {f.draftVersionId && f.publishedVersionNo !== null ? (
                    <Text tone="muted">{tr('has_draft')}</Text>
                  ) : null}
                </Stack>
              </li>
            );
          })}
        </Stack>
      )}
      <NewReadyFormDialog
        forms={list.data}
        isOpen={creating}
        onClose={() => setCreating(false)}
        onCreated={(formId) => void navigate(`/admin/ready-forms/${formId}`)}
      />
    </>
  );
}
