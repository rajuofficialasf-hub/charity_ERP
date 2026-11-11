import { CORE_FIELD_KEYS, type FieldType, type FormDefinition } from '@css/shared/forms';
import { localized, type Locale } from '@css/shared/i18n';
import {
  Alert,
  Button,
  Chip,
  ConfirmDialog,
  Dialog,
  Disclosure,
  EmptyState,
  Page,
  Skeleton,
  Stack,
  Tabs,
  Text,
} from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../api/client';
import { useAuth } from '../../lib/auth';
import { canBuildForms, canManagePublicLink, canPlaceForms } from '../roles';
import {
  addEmptySection,
  addLibraryField,
  addLibrarySection,
  addOwnQuestion,
  duplicateField,
  type LibraryFields,
  removeFieldWithUses,
  removeSectionWithUses,
  usesOf,
  usesOfSection,
} from './draft';
import { useChangeSentences } from './ChangeSummary';
import {
  FORMS_KEY,
  type FormVersion,
  type FormVersionListItem,
  formVersions,
  LIBRARY_KEY,
  library,
  newVersion,
  publishVersion,
  takeVersion,
  versionWithEtag,
} from './forms-api';
import { AddPane } from './AddPane';
import { BuildersOnly } from './BuildersOnly';
import { type BuilderScope, useFormSummary } from './form-summary';
import { CanvasDnd, FormCanvas } from './FormCanvas';
import { HistoryButtons } from './HistoryButtons';
import { OwnQuestionDialog } from './OwnQuestionDialog';
import type { BuilderMode, Selection } from './selection';
import { PreviewPane } from './PreviewPane';
import { PublicLinkPanel } from './PublicLinkPanel';
import { SettingsPane } from './SettingsPane';
import { UsesDialog } from './UsesDialog';
import { type HistoryStep, type Typed, useDraftHistory } from './use-draft-history';
import { detailsOf, useDraftSave } from './use-draft-save';
import { ScoringDialog } from './ScoringDialog';
import { VersionList } from './VersionList';
import './builder.css';
import { LoadError } from '../../components/LoadError';

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
 * The form builder of a project's form, a ready form or the question library (docs/ui/SCREENS.md,
 * "Form builder"): the library,
 * the outline and the settings of the chosen part side by side on a computer, the outline alone
 * with text edits on a phone. The draft saves itself, and every change to it can be undone and
 * redone from the form head; a published version opens read-only. The
 * preview opens from the header in a dialog; the form's name, its versions with their change
 * summaries and its public link sit in the right pane's second tab; publishing asks first with
 * the summary.
 */
/** The builder of a ready form outside the projects (`/admin/ready-forms/:formId`). */
export const ReadyFormBuilderPage = () => (
  <BuildersOnly>
    <FormBuilderPage scope="ready" />
  </BuildersOnly>
);
/** The builder of the question library (`/admin/question-library`). */
export const LibraryBuilderPage = () => (
  <BuildersOnly>
    <FormBuilderPage scope="library" />
  </BuildersOnly>
);

export function FormBuilderPage({ scope = 'project' }: { scope?: BuilderScope }) {
  const { projectId = '', formId: routeFormId = '' } = useParams();
  const t = useTranslations('forms.builder');
  const tp = useTranslations('forms.place');
  const locale = useLocale() as Locale;
  const { me } = useAuth();
  const phone = useMedia(PHONE);
  const queries = useQueryClient();
  // an earlier version opened from the list; otherwise the draft, else the published version
  const [viewing, setViewing] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [scoring, setScoring] = useState(false);
  // the question or part removed last, named until the next change so its way back is said
  const [removed, setRemoved] = useState<string | null>(null);
  // a question or a part other places of the form read, waiting for the word to remove it
  const [removing, setRemoving] = useState<{ field: string } | { section: string } | null>(null);
  const history = useDraftHistory();
  // a question is being dragged: the undo and redo keys rest until it lands
  const [dragging, setDragging] = useState(false);
  // a question of the project's own being asked for: its type, its section and, after a drop,
  // its place; the key opens the dialog afresh each time
  const [asking, setAsking] = useState<{
    key: number;
    type: FieldType;
    section: string;
    at?: number;
    /** The repeat group the question joins, when a group was chosen. */
    group?: string;
  } | null>(null);
  // the right pane: the chosen question, or the form itself; choosing a question opens the first
  const [pane, setPane] = useState<'question' | 'form'>('question');
  const sum = useFormSummary(scope, projectId, routeFormId);
  const form = sum.summary;
  const formId = form?.id ?? routeFormId;
  const versionId = viewing ?? form?.draftVersionId ?? form?.publishedVersionId ?? null;
  const read = useQuery({
    queryKey: [...FORMS_KEY, 'version', versionId],
    queryFn: () => versionWithEtag(versionId!),
    enabled: versionId !== null,
  });
  // the library is the builders' read too
  const lib = useQuery({
    queryKey: LIBRARY_KEY,
    queryFn: library,
    enabled: Boolean(me && canBuildForms(me)),
  });
  const versionsKey = [...FORMS_KEY, 'versions', formId];
  // the versions feed the publish confirmation and the version list, both the builders' only
  const versions = useQuery({
    queryKey: versionsKey,
    queryFn: () => formVersions(formId),
    enabled: Boolean(me && canBuildForms(me)) && formId !== '',
  });
  const sentences = useChangeSentences();
  const afterChange = async () => {
    setViewing(null);
    // the form's lists, its versions and, for the library form, the library everyone picks from
    await queries.invalidateQueries({ queryKey: FORMS_KEY });
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
  const take = useMutation({ mutationFn: () => takeVersion(formId), onSuccess: afterChange });
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
    // the draft's own save comes back as the same version at the version tag the save just
    // stored, and the steps still lead back from it; any other read (another version, a draft
    // changed elsewhere, a published one) is a draft the steps do not belong to
    const ownSave = seen?.data.id === read.data.data.id && read.data.meta.etag === etag;
    if (!ownSave) {
      history.clear();
      // a removal that was being asked about belonged to the draft that is gone
      setRemoving(null);
    }
    setSeen(read.data);
    setDraft({
      sections: read.data.data.sections,
      ...(read.data.data.scoring ? { scoring: read.data.data.scoring } : {}),
    });
    setEtag(read.data.meta.etag);
  }
  const fields: LibraryFields = useMemo(
    () => new Map((lib.data?.fields ?? []).map((f) => [f.key, f.formFields])),
    [lib.data],
  );

  if (sum.isPending || (versionId && read.isPending)) return <Skeleton shape="card" />;
  const notFound =
    (!sum.error && (!sum.found || !versionId)) ||
    (read.error instanceof ApiFailure && read.error.status === 404);
  if (notFound) return <EmptyState title={t('not_found')} description={t('not_found_hint')} />;
  if (sum.error || read.error || !read.data || !draft)
    return (
      <LoadError
        error={read.error}
        onRetry={() => {
          sum.refetch();
          if (versionId) void read.refetch();
        }}
      />
    );

  const version = read.data.data;
  const builder = Boolean(me && canBuildForms(me));
  const linkManager = Boolean(me && canManagePublicLink(me));
  const isDraft = version.status === 'draft';
  const mode: BuilderMode =
    !builder || !isDraft || save.refused ? 'read' : phone ? 'texts' : 'full';
  const sectionOf = (fieldKey: string) =>
    draft.sections.find((s) => s.fields.some((f) => f.fieldKey === fieldKey));
  // a dragged question keeps its selection, so its section is read from where it is now
  const selection: Selection | null = selected?.field
    ? ((s) => (s ? { section: s.key, field: selected.field } : null))(sectionOf(selected.field))
    : selected;
  const shown: HistoryStep = { definition: draft, selection };
  /** Shows a draft in place of the one on screen and saves it a little later. */
  const apply = (next: FormDefinition) => {
    // the messages of a refused publish belong to the draft as it was then
    if (publish.error) publish.reset();
    setRemoved(null);
    setDraft(next);
    save.schedule(next);
  };
  /**
   * Every change to the draft: kept as a step to undo, shown, and saved a little later. A typed
   * change (`how`) joins the typing just before it; any other is a step of its own.
   */
  const change = (next: FormDefinition, how?: Typed) => {
    if (next === draft || mode === 'read') return;
    history.record(shown, how);
    apply(next);
  };
  /**
   * Shows the draft an undo or a redo leads to, with what was chosen then, and saves it. The
   * right pane stays on the tab it shows: a person reading the form's versions keeps their place.
   */
  const restore = (step: HistoryStep | null) => {
    if (!step) return;
    setSelectedOnly(step.selection);
    apply(step.definition);
  };
  const labelOf = (fieldKey: string) => {
    const field = draft.sections.flatMap((s) => s.fields).find((f) => f.fieldKey === fieldKey);
    return field ? localized(field.label, locale) : null;
  };
  const titleOf = (sectionKey: string) => {
    const section = draft.sections.find((s) => s.key === sectionKey);
    return section ? localized(section.title, locale) : null;
  };
  /** A removal is one step to undo, with whatever read the removed questions gone in the same step. */
  const removeNow = (next: FormDefinition, name: string | null, chosen: boolean) => {
    setRemoving(null);
    if (name === null || next === draft) return;
    if (chosen) setSelected(null);
    change(next);
    setRemoved(name);
  };
  const removeFieldNow = (fieldKey: string) =>
    removeNow(removeFieldWithUses(draft, fieldKey), labelOf(fieldKey), true);
  const removeSectionNow = (sectionKey: string) =>
    removeNow(
      removeSectionWithUses(draft, sectionKey),
      titleOf(sectionKey),
      selection?.section === sectionKey,
    );
  // what nothing else reads goes at once; otherwise the dialog names the uses first
  const remove = (fieldKey: string) => {
    if (usesOf(draft, fieldKey).length) setRemoving({ field: fieldKey });
    else removeFieldNow(fieldKey);
  };
  const removeSection = (sectionKey: string) => {
    if (usesOfSection(draft, sectionKey).length) setRemoving({ section: sectionKey });
    else removeSectionNow(sectionKey);
  };
  const copy = (fieldKey: string) => {
    const section = sectionOf(fieldKey);
    const made = duplicateField(draft, fieldKey, { bn: t('copy_mark_bn'), en: t('copy_mark_en') });
    if (!section || !made.fieldKey) return;
    change(made.definition);
    setSelected({ section: section.key, field: made.fieldKey });
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
  const title = form?.title
    ? localized(form.title, locale)
    : scope === 'library'
      ? t('library_title')
      : t('title');
  // a placed form changes only by taking its ready form's newer version
  const placed = Boolean(form?.sourceFormId);
  // a library question goes to the chosen section, or to the last one when none is chosen
  const target =
    draft.sections.find((s) => s.key === selection?.section)?.key ?? draft.sections.at(-1)?.key;
  // a refused publish names its questions like a refused save; a newer edit's messages win
  const publishDetails = detailsOf(publish.error);
  const errors = { ...publishDetails, ...save.errors };
  // a refusal about the whole form names no question or section, so it shows above the outline
  const named = new Set(draft.sections.flatMap((s) => [s.key, ...s.fields.map((f) => f.fieldKey)]));
  // the identity roles no question is marked with yet: one alert naming them all
  const missingRoles = CORE_FIELD_KEYS.filter((k) => !named.has(k) && k in errors);
  const unplaced = Object.entries(errors).filter(
    ([key]) => !named.has(key) && !missingRoles.some((k) => k === key),
  );
  const published = versions.data?.find((v) => v.status === 'published') ?? null;
  const canPublish = builder && isDraft && !viewing && !phone && !save.refused;
  const canStartNext =
    builder && !phone && !placed && version.status === 'published' && !form?.draftVersionId;
  // a refusal that names no question shows above the panes: any refused new version, and a
  // refused publish without messages for the outline
  const failure = [
    Object.keys(publishDetails).length ? null : publish.error,
    next.error,
    take.error,
  ].find((e): e is ApiFailure => e instanceof ApiFailure);

  const outline = (
    <FormCanvas
      definition={draft}
      mode={mode}
      errors={errors}
      selected={selection}
      onSelect={setSelected}
      onChange={change}
      onRemoveField={remove}
      onRemoveSection={removeSection}
      onCopyField={copy}
      onAddTo={(sectionKey) => setSelected({ section: sectionKey })}
      onAddSection={() => {
        const made = addEmptySection(draft, (n) => ({
          bn: t('section_n_bn', { n: String(n) }),
          en: t('section_n_en', { n: String(n) }),
        }));
        change(made.definition);
        setSelected({ section: made.key });
      }}
      onAddRow={(groupKey) => {
        const section = sectionOf(groupKey);
        if (section) setSelected({ section: section.key, field: groupKey });
      }}
    />
  );
  const settings =
    mode === 'read' ? null : (
      <SettingsPane
        definition={draft}
        selected={selection}
        mode={mode === 'full' ? 'full' : 'texts'}
        identityMarks={form?.kind !== 'other'}
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
              // a chosen repeat group takes the question into its rows
              const chosen = selection?.field
                ? sectionOf(selection.field)?.fields.find((f) => f.fieldKey === selection.field)
                : undefined;
              const group = chosen?.type === 'repeat_group' ? chosen.fieldKey : undefined;
              if (target) setAsking({ key: Date.now(), type, section: target, group });
            }}
          />
        </aside>
      ) : null}

      <div className="fb-canvas">{outline}</div>
      <aside className="fb-side" aria-label={t('settings')}>
        <Tabs
          label={t('settings')}
          value={pane}
          onChange={(id) => setPane(id === 'form' ? 'form' : 'question')}
          items={[
            {
              value: 'question',
              label: t('question_settings'),
              content: settings ?? <Text tone="muted">{t('read_only_pane')}</Text>,
            },
            {
              value: 'form',
              label: t('form_settings'),
              content: (
                <Stack gap={3}>
                  <Text>
                    <Text>
                      <strong>{t('form_name')}</strong>
                    </Text>{' '}
                    {title}
                  </Text>
                  {/* the version list is the builders' read; a PM sees the placed version only */}
                  {builder ? (
                    <Disclosure title={t('versions')} icon="history" headingLevel={2} defaultOpen>
                      <VersionList
                        formId={formId}
                        shown={version.id}
                        canOpen={save.state === 'saved'}
                        onOpen={setViewing}
                      />
                    </Disclosure>
                  ) : null}
                  {/* the public link belongs to a project, and opens an application form only */}
                  {scope === 'project' && form?.kind === 'beneficiary_application' ? (
                    <Disclosure title={t('link.title')} icon="link" headingLevel={2}>
                      <PublicLinkPanel
                        projectId={projectId}
                        formId={formId}
                        published={Boolean(form.publishedVersionId)}
                        canManage={linkManager}
                      />
                    </Disclosure>
                  ) : null}
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
        onDragging={setDragging}
      >
        {panes}
      </CanvasDnd>
    ) : (
      panes
    );

  return (
    <>
      <DocumentTitle title={title} />
      <div data-testid="form-head">
        <Page
          title={title}
          actions={
            <>
              {viewing ? (
                <Button variant="secondary" onClick={() => setViewing(null)}>
                  {t('back_to_current')}
                </Button>
              ) : null}
              <Button variant="secondary" startIcon="eye" onClick={() => setPreviewing(true)}>
                {t('preview')}
              </Button>
              <Button variant="secondary" startIcon="calculator" onClick={() => setScoring(true)}>
                {t('scoring_button')}
              </Button>
              {canStartNext ? (
                <Button onClick={() => next.mutate()} loading={next.isPending}>
                  {t('new_version')}
                </Button>
              ) : null}
              {canPublish ? (
                <Button
                  onClick={() => {
                    publish.reset();
                    setPublishing(true);
                  }}
                  // the confirmation lists what changed, so it waits for the versions too
                  disabled={save.state !== 'saved' || !etag || !versions.isSuccess}
                >
                  {t('publish')}
                </Button>
              ) : null}
            </>
          }
          documentTitle={false}
        />
        <div className="fb-head-meta">
          {form ? <Chip>{t(`kind.${form.kind}`)}</Chip> : null}
          <Chip>{versionLabel}</Chip>
          <Text tone="muted">
            {t('count_line', {
              sections: String(draft.sections.length),
              questions: String(draft.sections.reduce((n, s) => n + s.fields.length, 0)),
            })}
          </Text>
          {isDraft && mode !== 'read' ? (
            <p className="admin-muted" aria-live="polite">
              {saveLabel}
            </p>
          ) : null}
          {mode === 'full' ? (
            <HistoryButtons
              canUndo={history.canUndo}
              canRedo={history.canRedo}
              resting={dragging}
              onUndo={() => restore(history.undo(shown))}
              onRedo={() => restore(history.redo(shown))}
            />
          ) : null}
        </div>
      </div>
      {failure ? <Alert tone="error">{failure.message}</Alert> : null}
      {placed ? <Alert tone="info">{tp('placed_note')}</Alert> : null}
      {placed && form?.newerVersionNo && me && canPlaceForms(me) && !viewing ? (
        <Alert
          tone="info"
          action={
            <Button size="small" onClick={() => take.mutate()} loading={take.isPending}>
              {tp('take')}
            </Button>
          }
        >
          {tp('newer', { n: String(form.newerVersionNo) })}
        </Alert>
      ) : null}
      {!isDraft && !placed ? <Alert tone="info">{t('read_only')}</Alert> : null}
      {save.refused ? <Alert tone="warning">{t('no_official')}</Alert> : null}
      {missingRoles.length ? (
        <Alert tone="error">
          {t('identity.missing', {
            roles: missingRoles.map((k) => t(`identity.roles.${k}`)).join(', '),
          })}
        </Alert>
      ) : null}
      {unplaced.map(([key, message]) => (
        <Alert key={key} tone="error">
          {message}
        </Alert>
      ))}
      {save.stale ? <Alert tone="warning">{t('stale')}</Alert> : null}
      {phone && isDraft && builder ? <Alert tone="info">{t('phone_note')}</Alert> : null}
      {removed !== null && mode === 'full' ? (
        <Alert tone="info">{t('removed', { label: removed, undo: t('undo') })}</Alert>
      ) : null}
      {panesWithDrag}
      {scoring ? (
        <ScoringDialog
          definition={draft}
          readOnly={mode !== 'full'}
          onChange={change}
          onClose={() => setScoring(false)}
        />
      ) : null}
      <Dialog
        title={t('preview_pane.title')}
        size="large"
        fullScreenOnPhone
        open={previewing}
        onClose={() => setPreviewing(false)}
      >
        {previewing ? <PreviewPane definition={draft} /> : null}
      </Dialog>
      {asking ? (
        <OwnQuestionDialog
          key={asking.key}
          open
          definition={draft}
          type={asking.type}
          sectionKey={asking.section}
          placed={asking.at !== undefined}
          groupKey={asking.group}
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
      {mode === 'full' && removing && 'field' in removing ? (
        <UsesDialog
          definition={draft}
          target="question"
          label={labelOf(removing.field) ?? ''}
          uses={usesOf(draft, removing.field)}
          onCancel={() => setRemoving(null)}
          onConfirm={() => removeFieldNow(removing.field)}
        />
      ) : null}
      {mode === 'full' && removing && 'section' in removing ? (
        <UsesDialog
          definition={draft}
          target="section"
          label={titleOf(removing.section) ?? ''}
          uses={usesOfSection(draft, removing.section)}
          onCancel={() => setRemoving(null)}
          onConfirm={() => removeSectionNow(removing.section)}
        />
      ) : null}
      <ConfirmDialog
        title={t('publish_title', { n: String(version.versionNo) })}
        message={t('publish_message')}
        confirmLabel={t('publish_confirm')}
        consequences={[...sentences(published, draft), t('publish_keeps')]}
        open={publishing}
        pending={publish.isPending}
        onConfirm={() => publish.mutate()}
        onCancel={() => setPublishing(false)}
      />
      <Dialog
        title={t('leave_title')}
        open={save.blocker.state === 'blocked'}
        onClose={() => save.blocker.reset?.()}
        actions={
          <>
            <Button variant="secondary" onClick={() => save.blocker.proceed?.()}>
              {t('leave_confirm')}
            </Button>
            <Button onClick={() => save.blocker.reset?.()}>{t('leave_stay')}</Button>
          </>
        }
      >
        <Text>{t('leave_message')}</Text>
      </Dialog>
    </>
  );
}
