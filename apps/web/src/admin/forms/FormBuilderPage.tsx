import type { FormDefinition, FormField, FormSection } from '@css/shared/forms';
import { localized, type Locale } from '@css/shared/i18n';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Modal,
  Skeleton,
  Stack,
  Tabs,
  Text,
} from '@css/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { FORM_BUILDER_ROLES } from '../roles';
import {
  addLibraryField,
  addLibrarySection,
  type LibraryFields,
  moveField,
  moveSection,
  removeField,
  removeSection,
  updateField,
} from './draft';
import { FORMS_KEY, type FormVersion, library, projectForms, versionWithEtag } from './forms-api';
import { LibraryPane } from './LibraryPane';
import { type OutlineMode, OutlinePane, type Selection } from './OutlinePane';
import { SettingsPane } from './SettingsPane';
import { useDraftSave } from './use-draft-save';
import './builder.css';

const PHONE = '(max-width: 767px)';

function usePhone() {
  const [phone, setPhone] = useState(() => window.matchMedia?.(PHONE).matches === true);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(PHONE);
    const update = () => setPhone(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return phone;
}

/**
 * The form builder of a project's form (SCR-061): the libraries, the outline and the settings of
 * the chosen part side by side on a computer, the outline alone with text edits on a phone. The
 * draft saves itself; a published version opens read-only.
 */
export function FormBuilderPage() {
  const { projectId = '', formId = '' } = useParams();
  const t = useTranslations('forms.builder');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const { me } = useAuth();
  const phone = usePhone();
  const queries = useQueryClient();
  const forms = useQuery({
    queryKey: [...FORMS_KEY, projectId],
    queryFn: () => projectForms(projectId),
  });
  const form = forms.data?.find((f) => f.id === formId);
  const versionId = form?.draftVersionId ?? form?.publishedVersionId ?? null;
  const read = useQuery({
    queryKey: [...FORMS_KEY, 'version', versionId],
    queryFn: () => versionWithEtag(versionId!),
    enabled: versionId !== null,
  });
  const lib = useQuery({ queryKey: [...FORMS_KEY, 'library'], queryFn: library });
  const [draft, setDraft] = useState<FormDefinition | null>(null);
  const [etag, setEtag] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<Selection | null>(null);
  // the version as read is where editing starts; a reload after a stale save starts again from it
  const [seen, setSeen] = useState<typeof read.data>(undefined);
  if (read.data && read.data !== seen) {
    setSeen(read.data);
    setDraft({ sections: read.data.data.sections });
    setEtag(read.data.meta.etag);
  }
  const save = useDraftSave({
    version: read.data?.data,
    etag,
    onSaved: (_saved: FormVersion, next: string) => setEtag(next),
    onStale: () =>
      void queries.invalidateQueries({ queryKey: [...FORMS_KEY, 'version', versionId] }),
  });
  const fields: LibraryFields = useMemo(
    () => new Map((lib.data?.fields ?? []).map((f) => [f.key, f.formFields])),
    [lib.data],
  );

  if (forms.isPending || (versionId && read.isPending)) return <Skeleton shape="card" />;
  const notFound =
    (forms.isSuccess && !form) || (read.error instanceof ApiFailure && read.error.status === 404);
  if (notFound || !versionId)
    return <EmptyState title={t('not_found')} message={t('not_found_hint')} />;
  if (forms.error || read.error || !read.data || !draft)
    return <ErrorState title={tc('state.error.text')} onRetry={() => void read.refetch()} />;

  const version = read.data.data;
  const builder = Boolean(me && me.roles.some((r) => FORM_BUILDER_ROLES.includes(r)));
  const isDraft = version.status === 'draft';
  const mode: OutlineMode =
    !builder || !isDraft || save.refused ? 'read' : phone ? 'texts' : 'full';
  const change = (next: FormDefinition) => {
    if (next === draft || mode === 'read') return;
    setDraft(next);
    save.schedule(next.sections);
  };
  const onSection = (key: string, patch: Partial<FormSection>) =>
    change({ sections: draft.sections.map((s) => (s.key === key ? { ...s, ...patch } : s)) });
  const onField = (key: string, patch: Partial<FormField>) =>
    change(updateField(draft, key, patch));
  const versionLabel = t(
    isDraft
      ? 'version_draft'
      : version.status === 'published'
        ? 'version_published'
        : 'version_retired',
    { n: String(version.versionNo) },
  );
  const saveLabel =
    save.state === 'saving' || save.state === 'pending'
      ? t('saving')
      : save.state === 'failed'
        ? t('save_failed')
        : t('saved');
  const title = form ? localized(form.title, locale) : t('title');

  const outline = (
    <OutlinePane
      definition={draft}
      mode={mode}
      errors={save.errors}
      selected={selected}
      onSelect={setSelected}
      onMoveSection={(key, dir) => change(moveSection(draft, key, dir))}
      onMoveField={(section, field, dir) => change(moveField(draft, section, field, dir))}
      onRemoveSection={(key) => change(removeSection(draft, key))}
      onRemoveField={(key) => change(removeField(draft, key))}
    />
  );
  const settings =
    mode === 'read' ? null : (
      <SettingsPane
        definition={draft}
        selected={selected}
        onSection={onSection}
        onField={onField}
      />
    );

  return (
    <>
      <DocumentTitle title={title} />
      <div className="admin-title-row">
        <h1 className="admin-title">{title}</h1>
        <Badge label={versionLabel} />
        {isDraft && mode !== 'read' ? (
          <Text tone="muted" aria-live="polite">
            {saveLabel}
          </Text>
        ) : null}
      </div>
      {!isDraft ? <Alert tone="info">{t('read_only')}</Alert> : null}
      {save.refused ? (
        <Alert tone="warning" live="alert">
          {t('no_official')}
        </Alert>
      ) : null}
      {save.stale ? (
        <Alert tone="warning" live="alert">
          {t('stale')}
        </Alert>
      ) : null}
      {phone && isDraft && builder ? <Alert tone="info">{t('phone_note')}</Alert> : null}
      {phone ? (
        <Stack gap={3}>
          {outline}
          {selected && settings ? <div className="form-builder-pane">{settings}</div> : null}
        </Stack>
      ) : (
        <div className="form-builder-panes">
          {lib.data && builder && isDraft ? (
            <div className="form-builder-pane">
              <LibraryPane
                library={lib.data}
                fields={fields}
                definition={draft}
                editable={mode === 'full'}
                onAddSection={(s) => change(addLibrarySection(draft, s, fields))}
                onAddField={(key) =>
                  change(
                    addLibraryField(
                      draft,
                      selected?.section ?? draft.sections.at(-1)!.key,
                      fields.get(key) ?? [],
                    ),
                  )
                }
              />
            </div>
          ) : null}
          <div className="form-builder-pane">{outline}</div>
          {settings ? (
            <div className="form-builder-pane">
              <Tabs
                label={t('settings')}
                items={[{ id: 'settings', label: t('settings'), content: settings }]}
              />
            </div>
          ) : null}
        </div>
      )}
      <Modal
        title={t('leave_title')}
        isOpen={save.blocker.state === 'blocked'}
        onClose={() => save.blocker.reset?.()}
        secondaryAction={
          <Button variant="secondary" onPress={() => save.blocker.proceed?.()}>
            {t('leave_confirm')}
          </Button>
        }
        primaryAction={<Button onPress={() => save.blocker.reset?.()}>{t('leave_stay')}</Button>}
      >
        <Text>{t('leave_message')}</Text>
      </Modal>
    </>
  );
}
