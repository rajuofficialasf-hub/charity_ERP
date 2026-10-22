import type { FieldType, FormDefinition } from '@css/shared/forms';
import { localized, type Locale } from '@css/shared/i18n';
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  Disclosure,
  EmptyState,
  ErrorState,
  Modal,
  Skeleton,
  Stack,
  Tabs,
  Text,
} from '@css/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, History, Link2 } from 'lucide-react';
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
  addOwnQuestion,
  duplicateField,
  type LibraryFields,
  removeField,
} from './draft';
import { useChangeSentences } from './ChangeSummary';
import {
  FORMS_KEY,
  type FormVersion,
  type FormVersionListItem,
  formVersions,
  library,
  newVersion,
  projectForms,
  publishVersion,
  versionWithEtag,
} from './forms-api';
import { AddPane } from './AddPane';
import { CanvasDnd, FormCanvas } from './FormCanvas';
import { OwnQuestionDialog } from './OwnQuestionDialog';
import type { BuilderMode, Selection } from './selection';
import { PreviewPane } from './PreviewPane';
import { PublicLinkPanel } from './PublicLinkPanel';
import { SettingsPane } from './SettingsPane';
import { detailsOf, useDraftSave } from './use-draft-save';
import { VersionList } from './VersionList';
import './builder.css';

const PHONE = '(max-width: 767px)';

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
 * preview opens from the header in a dialog; the form's name, its versions with their change
 * summaries and its public link sit in the right pane's second tab; publishing asks first with
 * the summary.
 */
export function FormBuilderPage() {
  const { projectId = '', formId = '' } = useParams();
  const t = useTranslations('forms.builder');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const { me } = useAuth();
  const phone = useMedia(PHONE);
  const queries = useQueryClient();
  // an earlier version opened from the list; otherwise the draft, else the published version
  const [viewing, setViewing] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  // the draft before the last removal, so one press brings the question back
  const [undo, setUndo] = useState<{ definition: FormDefinition; label: string } | null>(null);
  // a question of the project's own being asked for: its type, its section and, after a drop,
  // its place; the key opens the dialog afresh each time
  const [asking, setAsking] = useState<{
    key: number;
    type: FieldType;
    section: string;
    at?: number;
  } | null>(null);
  // the right pane: the chosen question, or the form itself; choosing a question opens the first
  const [pane, setPane] = useState<'question' | 'form'>('question');
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
  const [selected, setSelectedOnly] = useState<Selection | null>(null);
  const setSelected = (next: Selection | null) => {
    setSelectedOnly(next);
    if (next) setPane('question');
  };
  const versionKey = [...FORMS_KEY, 'version', versionId];
  const save = useDraftSave({
    version: read.data?.data,
    etag,
    onSaved: (saved: FormVersion, next: string) => {
      setEtag(next);
      // the cached version is what the builder opens with next time, and the version list
      // compares what was saved
      queries.setQueryData(versionKey, { data: saved, meta: { etag: next } });
      queries.setQueryData<FormVersionListItem[]>(versionsKey, (list) =>
        list?.map((v) =>
          v.id === saved.id
            ? {
                ...v,
                ...saved,
                updatedAt: new Date().toISOString(),
                updatedBy: me ? { id: me.id, name: me.displayName } : v.updatedBy,
              }
            : v,
        ),
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
  const mode: BuilderMode =
    !builder || !isDraft || save.refused ? 'read' : phone ? 'texts' : 'full';
  const sectionOf = (fieldKey: string) =>
    draft.sections.find((s) => s.fields.some((f) => f.fieldKey === fieldKey));
  const change = (next: FormDefinition) => {
    if (next === draft || mode === 'read') return;
    // the messages of a refused publish belong to the draft as it was then
    if (publish.error) publish.reset();
    // a removal can be undone only until the next change, so the undo never drops later work
    setUndo(null);
    setDraft(next);
    save.schedule(next.sections);
  };
  const remove = (fieldKey: string) => {
    const field = draft.sections.flatMap((s) => s.fields).find((f) => f.fieldKey === fieldKey);
    const next = removeField(draft, fieldKey);
    if (!field || next === draft) return;
    setSelected(null);
    change(next);
    setUndo({ definition: draft, label: field.label[locale] });
  };
  const copy = (fieldKey: string) => {
    const section = sectionOf(fieldKey);
    const made = duplicateField(draft, fieldKey, { bn: t('copy_mark_bn'), en: t('copy_mark_en') });
    if (!section || !made.fieldKey) return;
    change(made.definition);
    setSelected({ section: section.key, field: made.fieldKey });
  };
  // a dragged question keeps its selection, so its section is read from where it is now
  const selection: Selection | null = selected?.field
    ? ((s) => (s ? { section: s.key, field: selected.field } : null))(sectionOf(selected.field))
    : selected;
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
    draft.sections.find((s) => s.key === selection?.section)?.key ?? draft.sections.at(-1)?.key;
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
    <FormCanvas
      definition={draft}
      mode={mode}
      errors={errors}
      selected={selection}
      onSelect={setSelected}
      onChange={change}
      onRemoveField={remove}
      onCopyField={copy}
      onAddTo={(sectionKey) => setSelected({ section: sectionKey })}
    />
  );
  const settings =
    mode === 'read' ? null : (
      <SettingsPane
        definition={draft}
        selected={selection}
        mode={mode === 'full' ? 'full' : 'texts'}
        onChange={change}
      />
    );

  const panes = (
    <div className="fb-panes">
      {mode === 'full' && lib.data ? (
        <aside className="fb-side" aria-label={t('add_pane')}>
          <AddPane
            library={lib.data}
            fields={fields}
            definition={draft}
            targetSection={target}
            onAddSection={(s) => change(addLibrarySection(draft, s, fields))}
            onAddField={(key) => {
              if (target) change(addLibraryField(draft, target, fields.get(key) ?? []));
            }}
            onAddType={(type) => {
              if (target) setAsking({ key: Date.now(), type, section: target });
            }}
          />
        </aside>
      ) : null}

      <div className="fb-canvas">{outline}</div>
      <aside className="fb-side" aria-label={t('settings')}>
        <Tabs
          label={t('settings')}
          selectedId={pane}
          onChange={(id) => setPane(id === 'form' ? 'form' : 'question')}
          items={[
            {
              id: 'question',
              label: t('question_settings'),
              content: settings ?? <Text tone="muted">{t('read_only_pane')}</Text>,
            },
            {
              id: 'form',
              label: t('form_settings'),
              content: (
                <Stack gap={3}>
                  <Text>
                    <Text as="span" weight="bold">
                      {t('form_name')}
                    </Text>{' '}
                    {title}
                  </Text>
                  <Disclosure title={t('versions')} icon={History} headingLevel={2} defaultOpen>
                    <VersionList
                      formId={formId}
                      shown={version.id}
                      canOpen={save.state === 'saved'}
                      onOpen={setViewing}
                    />
                  </Disclosure>
                  <Disclosure title={t('link.title')} icon={Link2} headingLevel={2}>
                    <PublicLinkPanel
                      projectId={projectId}
                      formId={formId}
                      published={Boolean(form?.publishedVersionId)}
                      canManage={builder}
                    />
                  </Disclosure>
                </Stack>
              ),
            },
          ]}
        />
      </aside>
    </div>
  );
  const panesWithDrag =
    mode === 'full' ? (
      <CanvasDnd
        definition={draft}
        onChange={change}
        onDropType={(type, section, at) => setAsking({ key: Date.now(), type, section, at })}
      >
        {panes}
      </CanvasDnd>
    ) : (
      panes
    );

  return (
    <>
      <DocumentTitle title={title} />
      <div className="fb-head">
        <h1 className="admin-title">{title}</h1>
        <div className="fb-head-meta">
          <Badge label={versionLabel} />
          <Text tone="muted">
            {t('count_line', {
              sections: String(draft.sections.length),
              questions: String(draft.sections.reduce((n, s) => n + s.fields.length, 0)),
            })}
          </Text>
          {isDraft && mode !== 'read' ? (
            <Text tone="muted" aria-live="polite">
              {saveLabel}
            </Text>
          ) : null}
        </div>
        <div className="fb-head-actions">
          {viewing ? (
            <Button variant="secondary" onPress={() => setViewing(null)}>
              {t('back_to_current')}
            </Button>
          ) : null}
          <Button variant="secondary" icon={Eye} onPress={() => setPreviewing(true)}>
            {t('preview')}
          </Button>
          {canStartNext ? (
            <Button onPress={() => next.mutate()} loading={next.isPending}>
              {t('new_version')}
            </Button>
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
        </div>
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
      {undo && mode === 'full' ? (
        <Alert
          tone="info"
          live="status"
          action={
            <Button
              size="sm"
              variant="secondary"
              onPress={() => {
                change(undo.definition);
                setUndo(null);
              }}
            >
              {t('undo')}
            </Button>
          }
        >
          {t('removed', { label: undo.label })}
        </Alert>
      ) : null}
      {panesWithDrag}
      <Modal
        title={t('preview_pane.title')}
        size="lg"
        fullOnPhone
        isOpen={previewing}
        onClose={() => setPreviewing(false)}
      >
        {previewing ? <PreviewPane definition={draft} /> : null}
      </Modal>
      {asking ? (
        <OwnQuestionDialog
          key={asking.key}
          isOpen
          definition={draft}
          type={asking.type}
          sectionKey={asking.section}
          placed={asking.at !== undefined}
          onClose={() => setAsking(null)}
          onAdd={(question, sectionKey) => {
            const added = addOwnQuestion(draft, sectionKey, question, asking.at);
            setAsking(null);
            if (!added.fieldKey) return;
            change(added.definition);
            setSelected({ section: sectionKey, field: added.fieldKey });
          }}
        />
      ) : null}
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
