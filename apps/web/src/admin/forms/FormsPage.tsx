import { localized, type Locale } from '@css/shared/i18n';
import { Button, EmptyState, ErrorState, Skeleton, Stack } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { useAuth } from '../../lib/auth';
import { canBuildForms } from '../roles';
import { FORMS_KEY, projectForms } from './forms-api';
import { NewFormDialog } from './NewFormDialog';

/** The forms of a project, each opening its builder, and the start of a new one. */
export function FormsPage() {
  const { projectId = '' } = useParams();
  const t = useTranslations('forms.builder');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const navigate = useNavigate();
  const { me } = useAuth();
  // the setup screen sends a project without a form here with ?new=1 to start one
  const [search] = useSearchParams();
  const [creating, setCreating] = useState(() => search.get('new') === '1');
  const list = useQuery({
    queryKey: [...FORMS_KEY, projectId],
    queryFn: () => projectForms(projectId),
  });
  const builder = Boolean(me && canBuildForms(me));
  if (list.isPending) return <Skeleton shape="row" count={3} />;
  if (list.error)
    return <ErrorState title={tc('state.error.text')} onRetry={() => void list.refetch()} />;
  return (
    <>
      <DocumentTitle title={t('forms_title')} />
      <div className="admin-title-row">
        <h1 className="admin-title">{t('forms_title')}</h1>
        {builder ? <Button onPress={() => setCreating(true)}>{t('new_form')}</Button> : null}
      </div>
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
        isOpen={creating && builder}
        onClose={() => setCreating(false)}
        onCreated={(formId) => void navigate(`/admin/projects/${projectId}/forms/${formId}`)}
      />
    </>
  );
}
