import type { FormDefinition } from '@css/shared/forms';
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
import { canBuildForms } from '../roles';
import {
  addLibraryField,
  addLibrarySection,
  type LibraryFields,
  moveField,
  moveSection,
  removeField,
  removeSection,
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
 * The form builder of a project's form (docs/ui/SCREENS.md, "Form builder"): the libraries,
 * the outline and the settings of the chosen part side by side on a computer, the outline alone
 * with text edits on a phone. The draft saves itself; a published version opens read-only.
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
  const versionKey = [...FORMS_KEY, 'version', versionId];
  const save = useDraftSave({
    version: read.data?.data,
    etag,
    onSaved: (saved: FormVersion, next: string) => {
      setEtag(next);
      // the cached version is what the builder opens with next time
      queries.setQueryData(versionKey, { data: saved, meta: { etag: next } });
    },
    onStale: () => void queries.invalidateQueries({ queryKey: versionKey }),
  });
  // the version as read is where editing starts, and a reload after a stale save starts again
  // from it; while a change waits to be saved, the screen keeps the change
  const [seen, setSeen] = useState<typeof read.data>(undefined);
  if (read.data && read.data !== seen && save.state === 'saved') {
    setSeen(read.data);
    setDraft({ sections: read.data.data.sections });
    setEtag(read.data.meta.etag);
  }
  const fields: LibraryFields = useMemo(
    () => new Map((lib.data?.fields ?? []).map((f) => [f.key, f.formFields])),
    [lib.data],
  );

  if (forms.isPending || (versionId && read.isPending)) return <Skeleton shape="card" />;
  const notFound =
    (forms.isSuccess && !versionId) ||
    (read.error instanceof ApiFailure && read.error.status === 404);
  if (notFound) return <EmptyState title={t('not_found')} message={t('not_found_hint')} />;
  if (forms.error || read.error || !read.data || !draft)
    return (
      <ErrorState
        title={tc('state.error.text')}
        onRetry={() => {
          void forms.refetch();
          if (versionId) void read.refetch();
        }}
      />
    );

  const version = read.data.data;
  const builder = Boolean(me && canBuildForms(me));
  const isDraft = version.status === 'draft';
  const mode: OutlineMode =
    !builder || !isDraft || save.refused ? 'read' : phone ? 'texts' : 'full';
  const change = (next: FormDefinition) => {
    if (next === draft || mode === 'read') return;
    setDraft(next);
    save.schedule(next.sections);
  };
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
  // a library question goes to the chosen section, or to the last one when none is chosen
  const target =
    draft.sections.find((s) => s.key === selected?.section)?.key ?? draft.sections.at(-1)?.key;
  // a refusal about the whole form names no question or section, so it shows above the outline
  const named = new Set(draft.sections.flatMap((s) => [s.key, ...s.fields.map((f) => f.fieldKey)]));
  const unplaced = Object.entries(save.errors).filter(([key]) => !named.has(key));

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
        mode={mode === 'full' ? 'full' : 'texts'}
        onChange={change}
        onSelect={setSelected}
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
      {unplaced.map(([key, message]) => (
        <Alert key={key} tone="danger">
          {message}
        </Alert>
      ))}
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
                fieldsEditable={target !== undefined}
                onAddSection={(s) => change(addLibrarySection(draft, s, fields))}
                onAddField={(key) => {
                  if (target) change(addLibraryField(draft, target, fields.get(key) ?? []));
                }}
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
