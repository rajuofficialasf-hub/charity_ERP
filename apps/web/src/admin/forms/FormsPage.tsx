import { localized, type Locale } from '@css/shared/i18n';
import { Button, EmptyState, ErrorState, Skeleton, Stack, PageHeader } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { useAuth } from '../../lib/auth';
import { canBuildForms, canPlaceForms } from '../roles';
import { FORMS_KEY, projectForms } from './forms-api';
import { NewFormDialog } from './NewFormDialog';
import { PlaceFormDialog } from './PlaceFormDialog';

/**
 * The forms of a project, each opening its builder: a PM places a published ready form, and the
 * two global roles may also start a form of the project's own.
 */
export function FormsPage() {
  const { projectId = '' } = useParams();
  const t = useTranslations('forms.builder');
  const tc = useTranslations('common');
  const tp = useTranslations('forms.place');
  const locale = useLocale() as Locale;
  const navigate = useNavigate();
  const { me } = useAuth();
  // the setup screen sends a project without a form here with ?new=1: the placement opens
  const [search, setSearch] = useSearchParams();
  const [dialog, setDialog] = useState<'place' | 'new' | null>(() =>
    search.get('new') === '1' ? 'place' : null,
  );
  // the request is used once: a reload or a step back never opens the dialog again
  const close = () => {
    setDialog(null);
    if (search.has('new')) setSearch({}, { replace: true });
  };
  const opened = (formId: string) =>
    void navigate(`/admin/projects/${projectId}/forms/${formId}`, {
      replace: search.has('new'),
    });
  const list = useQuery({
    queryKey: [...FORMS_KEY, projectId],
    queryFn: () => projectForms(projectId),
  });
  const builder = Boolean(me && canBuildForms(me));
  const placer = Boolean(me && canPlaceForms(me));
  if (list.isPending) return <Skeleton shape="row" count={3} />;
  if (list.error)
    return <ErrorState title={tc('state.error.text')} onRetry={() => void list.refetch()} />;
  return (
    <>
      <DocumentTitle title={t('forms_title')} />
      <PageHeader
        title={t('forms_title')}
        actions={
          <Stack direction="row" gap={2} wrap>
            {builder ? (
              <Button variant="secondary" onPress={() => setDialog('new')}>
                {t('new_form')}
              </Button>
            ) : null}
            {placer ? <Button onPress={() => setDialog('place')}>{tp('button')}</Button> : null}
          </Stack>
        }
      />
      {list.data.length === 0 ? (
        <EmptyState title={t('none')} />
      ) : (
        <Stack as="ul" gap={2}>
          {list.data.map((f) => (
            <li key={f.id}>
              <Link to={`/admin/projects/${projectId}/forms/${f.id}`}>
                {t('open_form', { title: localized(f.title, locale) })}
              </Link>
            </li>
          ))}
        </Stack>
      )}
      <NewFormDialog
        projectId={projectId}
        firstForm={list.data.length === 0}
        isOpen={dialog === 'new' && builder}
        onClose={close}
        onCreated={opened}
      />
      <PlaceFormDialog
        projectId={projectId}
        firstForm={list.data.length === 0}
        isOpen={dialog === 'place' && placer}
        onClose={close}
        onPlaced={opened}
      />
    </>
  );
}
