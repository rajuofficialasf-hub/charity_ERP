import type { FormDefinition } from '@css/shared/forms';
import { localized, type Locale } from '@css/shared/i18n';
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Modal,
  Skeleton,
  Stack,
  Tabs,
  Text,
} from '@css/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { useChangeSentences } from './ChangeSummary';
import {
  FORMS_KEY,
  type FormVersion,
  formVersions,
  library,
  newVersion,
  projectForms,
  publishVersion,
  versionWithEtag,
} from './forms-api';
import { LibraryPane } from './LibraryPane';
import { type OutlineMode, OutlinePane, type Selection } from './OutlinePane';
import { PreviewPane } from './PreviewPane';
import { PublicLinkPanel } from './PublicLinkPanel';
import { SettingsPane } from './SettingsPane';
import { detailsOf, useDraftSave } from './use-draft-save';
import { VersionList } from './VersionList';
import './builder.css';

const PHONE = '(max-width: 767px)';
const WIDE = '(min-width: 1280px)';

function useMedia(media: string) {
  const [matches, setMatches] = useState(() => window.matchMedia?.(media).matches === true);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(media);
    const update = () => setMatches(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [media]);
  return matches;
}

/**
 * The form builder of a project's form (docs/ui/SCREENS.md, "Form builder"): the libraries,
 * the outline and the settings of the chosen part side by side on a computer, the outline alone
 * with text edits on a phone. The draft saves itself; a published version opens read-only. The
 * preview is a tab beside the settings, or a fourth pane from 1280 px; the versions with their
 * change summaries follow the panes, and publishing asks first with the summary.
 */
export function FormBuilderPage() {
  const { projectId = '', formId = '' } = useParams();
  const t = useTranslations('forms.builder');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const { me } = useAuth();
  const phone = useMedia(PHONE);
  const wide = useMedia(WIDE);
  const queries = useQueryClient();
  // an earlier version opened from the list; otherwise the draft, else the published version
  const [viewing, setViewing] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const forms = useQuery({
    queryKey: [...FORMS_KEY, projectId],
    queryFn: () => projectForms(projectId),
  });
  const form = forms.data?.find((f) => f.id === formId);
  const versionId = viewing ?? form?.draftVersionId ?? form?.publishedVersionId ?? null;
  const read = useQuery({
    queryKey: [...FORMS_KEY, 'version', versionId],
    queryFn: () => versionWithEtag(versionId!),
    enabled: versionId !== null,
  });
  const lib = useQuery({ queryKey: [...FORMS_KEY, 'library'], queryFn: library });
  const versionsKey = [...FORMS_KEY, 'versions', formId];
  const versions = useQuery({ queryKey: versionsKey, queryFn: () => formVersions(formId) });
  const sentences = useChangeSentences();
  const afterChange = async () => {
    setViewing(null);
    await Promise.all([
      queries.invalidateQueries({ queryKey: [...FORMS_KEY, projectId] }),
      queries.invalidateQueries({ queryKey: versionsKey }),
    ]);
  };
  const publish = useMutation({
    mutationFn: () => publishVersion(versionId!, etag!),
    onSuccess: async (done) => {
      setPublishing(false);
      queries.setQueryData([...FORMS_KEY, 'version', done.data.id], done);
      await afterChange();
    },
    onError: (error) => {
      setPublishing(false);
      // a draft changed elsewhere is read again, so the next try carries its new version
      if (error instanceof ApiFailure && error.status === 412)
        void queries.invalidateQueries({ queryKey: versionKey });
    },
  });
  const next = useMutation({ mutationFn: () => newVersion(formId), onSuccess: afterChange });
  const [draft, setDraft] = useState<FormDefinition | null>(null);
  const [etag, setEtag] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<Selection | null>(null);
  const versionKey = [...FORMS_KEY, 'version', versionId];
  const save = useDraftSave({
    version: read.data?.data,
    etag,
    onSaved: (saved: FormVersion, next: string) => {
      setEtag(next);
      // the cached version is what the builder opens with next time, and the version list
      // compares what was saved
      queries.setQueryData(versionKey, { data: saved, meta: { etag: next } });
      queries.setQueryData<FormVersion[]>(versionsKey, (list) =>
        list?.map((v) => (v.id === saved.id ? saved : v)),
      );
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
    // the messages of a refused publish belong to the draft as it was then
    if (publish.error) publish.reset();
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
  // a refused publish names its questions like a refused save; a newer edit's messages win
  const publishDetails = detailsOf(publish.error);
  const errors = { ...publishDetails, ...save.errors };
  // a refusal about the whole form names no question or section, so it shows above the outline
  const named = new Set(draft.sections.flatMap((s) => [s.key, ...s.fields.map((f) => f.fieldKey)]));
  const unplaced = Object.entries(errors).filter(([key]) => !named.has(key));
  const published = versions.data?.find((v) => v.status === 'published') ?? null;
  const canPublish = builder && isDraft && !viewing && !phone && !save.refused;
  const canStartNext = builder && !phone && version.status === 'published' && !form?.draftVersionId;
  // a refusal that names no question shows above the panes: any refused new version, and a
  // refused publish without messages for the outline
  const failure = [Object.keys(publishDetails).length ? null : publish.error, next.error].find(
    (e): e is ApiFailure => e instanceof ApiFailure,
  );

  const outline = (
    <OutlinePane
      definition={draft}
      mode={mode}
      errors={errors}
      selected={selected}
      onSelect={setSelected}
      onMoveSection={(key, dir) => change(moveSection(draft, key, dir))}
      onMoveField={(section, field, dir) => change(moveField(draft, section, field, dir))}
      onRemoveSection={(key) => change(removeSection(draft, key))}
      onRemoveField={(key) => change(removeField(draft, key))}
    />
  );
  const preview = <PreviewPane definition={draft} />;
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
        {canPublish ? (
          <Button
            onPress={() => {
              publish.reset();
              setPublishing(true);
            }}
            // the confirmation lists what changed, so it waits for the versions too
            disabled={save.state !== 'saved' || !etag || !versions.isSuccess}
          >
            {t('publish')}
          </Button>
        ) : null}
        {canStartNext ? (
          <Button onPress={() => next.mutate()} loading={next.isPending}>
            {t('new_version')}
          </Button>
        ) : null}
        {viewing ? (
          <Button variant="secondary" onPress={() => setViewing(null)}>
            {t('back_to_current')}
          </Button>
        ) : null}
      </div>
      {failure ? (
        <Alert tone="danger" live="alert">
          {failure.message}
        </Alert>
      ) : null}
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
        <div className={wide ? 'form-builder-panes has-preview' : 'form-builder-panes'}>
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
          <div className="form-builder-pane">
            <Tabs
              label={t('settings')}
              items={[
                ...(settings ? [{ id: 'settings', label: t('settings'), content: settings }] : []),
                ...(wide ? [] : [{ id: 'preview', label: t('preview'), content: preview }]),
              ]}
            />
          </div>
          {wide ? <div className="form-builder-pane">{preview}</div> : null}
        </div>
      )}
      {phone ? <div className="form-builder-pane">{preview}</div> : null}
      <div className="form-builder-pane">
        <VersionList
          formId={formId}
          shown={version.id}
          canOpen={save.state === 'saved'}
          onOpen={setViewing}
        />
      </div>
      <div className="form-builder-pane">
        <PublicLinkPanel
          projectId={projectId}
          formId={formId}
          published={Boolean(form?.publishedVersionId)}
          canManage={builder}
        />
      </div>
      <ConfirmDialog
        title={t('publish_title', { n: String(version.versionNo) })}
        message={t('publish_message')}
        confirmLabel={t('publish_confirm')}
        consequence={[...sentences(published, draft), t('publish_keeps')]}
        isOpen={publishing}
        pending={publish.isPending}
        onConfirm={() => publish.mutate()}
        onCancel={() => setPublishing(false)}
      />
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
