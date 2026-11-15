import type { CoreFieldKey, FieldType, FormDefinition } from '@css/shared/forms';
import { localized, type Locale } from '@css/shared/i18n';
import {
  Alert,
  Button,
  Chip,
  ConfirmDialog,
  Dialog,
  Disclosure,
  Drawer,
  EmptyState,
  Icon,
  IconButton,
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
import { useOnline } from '../../components/shell/use-online';
import { type ApiErrorDetail, ApiFailure } from '../../api/client';
import { useAuth } from '../../lib/auth';
import { canBuildForms, canManagePublicLink, canPlaceForms } from '../roles';
import {
  addEmptySection,
  addIdentityQuestions,
  addMobileOwnerQuestions,
  addLibraryField,
  addLibrarySection,
  addOwnQuestion,
  duplicateField,
  lacksMobileOwnerQuestion,
  type LibraryFields,
  missingIdentityRoles,
  type GuardianRelationWording,
  type MobileOwnerWording,
  missingTextCount,
  moveFieldTo,
  removeFieldWithUses,
  removeSectionWithUses,
  textsOf,
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
import { CanvasDnd, FormCanvas, type Reveal } from './FormCanvas';
import { HistoryButtons } from './HistoryButtons';
import type { BuilderMode, Selection } from './selection';
import { PreviewPane } from './PreviewPane';
import { PublicLinkPanel } from './PublicLinkPanel';
import { PublishChecklist, useEntryWords } from './PublishChecklist';
import {
  type EntryTarget,
  problemsByPlace,
  publishEntries,
  type PublishEntry,
  standing,
} from './publish-entries';
import { SettingsPane } from './SettingsPane';
import { TranslationsDialog } from './TranslationsDialog';
import { UsesDialog } from './UsesDialog';
import { type HistoryStep, type Typed, useDraftHistory } from './use-draft-history';
import { detailsOf, refusalOf, useDraftSave } from './use-draft-save';
import { usePaneFolds } from './use-pane-folds';
import { ScoringDialog } from './ScoringDialog';
import { startTable } from './TableSettings';
import { VersionList } from './VersionList';
import './builder.css';
import { LoadError } from '../../components/LoadError';

const PHONE = '(max-width: 767px)';
/** Under a computer's width the settings have no column of their own. */
const NARROW = '(max-width: 1023px)';
const NO_DETAILS: readonly ApiErrorDetail[] = [];
/** What the server named when it refused a publish, and the draft it was asked about. */
interface Refusal {
  details: readonly ApiErrorDetail[];
  draft: FormDefinition | null;
}
const NO_REFUSAL: Refusal = { details: NO_DETAILS, draft: null };
const NO_ENTRIES: readonly PublishEntry[] = [];

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
 * with text edits on a phone. The outline has the most room; each side pane folds away to a strip,
 * as the person left it on this device, and where the settings have no column (under 1024 px, or
 * folded) they open over the form in a drawer when a question or a part is chosen. A question is
 * added in place with no dialog: empty, after the
 * chosen question or where a menu of the types was opened, chosen, in view, and with the cursor
 * in its Bengali text. The draft saves itself, tries again by itself when a save fails
 * on the way and says so in the form head, and every change to it can be undone and redone from
 * there; leaving saves first. A published version opens read-only. The
 * preview opens from the header in a dialog; the form's name, its versions with their change
 * summaries and its public link sit in the right pane's second tab. What stands between the draft
 * and its publishing is listed beside the Publish button while the form is built, each line
 * leading to its place; Publish opens that list while the draft's own check finds anything, and
 * asks first with the summary of the changes once it finds nothing; what the server refuses
 * lands in the same list, and leaves it once the question or the part it names is changed. A
 * beneficiary application form that lacks identity questions gets them in one press, from the
 * start card of the empty canvas or from the list's identity line. "অনুবাদ" in the header opens
 * every text of the form in both languages, with the number still missing on the button; the
 * list's missing texts open the same view on the incomplete ones alone.
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
  const narrow = useMedia(NARROW);
  const folds = usePaneFolds();
  // where the settings have no column (a narrow screen, or the column folded away) they come
  // over the form in a drawer
  const settingsOver = narrow || folds.isFolded('settings');
  const [drawer, setDrawer] = useState(false);
  const online = useOnline();
  const queries = useQueryClient();
  // an earlier version opened from the list; otherwise the draft, else the published version
  const [viewing, setViewing] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  // the list of what to fix before publishing, open
  const [listing, setListing] = useState(false);
  // what the server named when it last refused the publish; it stays through the edits made
  // elsewhere, until the server is asked again or another draft takes this one's place
  const [refusal, setRefusal] = useState(NO_REFUSAL);
  // the question or the part the canvas is asked to bring into view, until it has
  const [reveal, setReveal] = useState<Reveal | null>(null);
  // the question just added, whose Bengali text takes the focus in the settings, until it has
  const [typing, setTyping] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [scoring, setScoring] = useState(false);
  // the translations of the whole form, open on every text or on the incomplete ones alone
  const [translating, setTranslating] = useState<{ missing: boolean } | null>(null);
  // the question or part removed last, named until the next change so its way back is said
  const [removed, setRemoved] = useState<string | null>(null);
  // a question or a part other places of the form read, waiting for the word to remove it
  const [removing, setRemoving] = useState<{ field: string } | { section: string } | null>(null);
  const history = useDraftHistory();
  // a question is being dragged: the undo and redo keys rest until it lands
  const [dragging, setDragging] = useState(false);
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
    // the server is asked again, so its earlier word no longer stands; what it says now is about
    // the draft as it is at this moment
    onMutate: () => {
      setRefusal(NO_REFUSAL);
      return { draft };
    },
    onSuccess: async (done) => {
      setPublishing(false);
      queries.setQueryData([...FORMS_KEY, 'version', done.data.id], done);
      await afterChange();
    },
    onError: (error, _nothing, asked) => {
      setPublishing(false);
      // a draft changed elsewhere is read again, so the next try carries its new version
      if (error instanceof ApiFailure && error.status === 412)
        void queries.invalidateQueries({ queryKey: versionKey });
      // what the refusal names goes into the list, which opens to say so
      const details = refusalOf(error);
      if (details.length === 0) return;
      setRefusal({ details, draft: asked?.draft ?? null });
      setListing(true);
    },
  });
  const next = useMutation({ mutationFn: () => newVersion(formId), onSuccess: afterChange });
  const take = useMutation({ mutationFn: () => takeVersion(formId), onSuccess: afterChange });
  const [draft, setDraft] = useState<FormDefinition | null>(null);
  const [etag, setEtag] = useState<string | undefined>(undefined);
  const [selected, setSelectedOnly] = useState<Selection | null>(null);
  const setSelected = (next: Selection | null) => {
    setSelectedOnly(next);
    if (!next) return;
    setPane('question');
    // choosing a question or a part is asking for its settings
    if (settingsOver) setDrawer(true);
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
      // a removal that was being asked about belonged to the draft that is gone, and so did
      // what the server said about it
      setRemoving(null);
      setRefusal(NO_REFUSAL);
      setListing(false);
      setTranslating(null);
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
  const builder = Boolean(me && canBuildForms(me));
  const isDraft = read.data?.data.status === 'draft';
  // a draft is published from a computer, by a builder the server lets save it
  const canPublish = builder && isDraft && !viewing && !phone && !save.refused;
  const kind = form?.kind;
  // what the server named in the save it refused last, where the draft is still as it was then:
  // a question or a part changed since waits for the server's next word
  const saveRefused = useMemo(
    () => (draft ? standing(save.details, save.refusedDraft, draft) : NO_DETAILS),
    [save.details, save.refusedDraft, draft],
  );
  // what the server named last, in a refused save and in a refused publish
  const refused = useMemo(
    () => [...saveRefused, ...(draft ? standing(refusal.details, refusal.draft, draft) : [])],
    [saveRefused, refusal, draft],
  );
  // what stands between the draft and its publishing: the engine's own check of the draft as it
  // is now, so an entry leaves with its cause, joined with what only the server knows
  const entries = useMemo(
    () => (draft && canPublish ? publishEntries(draft, kind, refused) : NO_ENTRIES),
    [draft, canPublish, kind, refused],
  );
  const say = useEntryWords();
  const problems = useMemo(() => problemsByPlace(entries, say), [entries, say]);
  // what the server said about a question or a part shows on it: a refused save's messages, and
  // of a refused publish those the list cannot word itself
  const errors = useMemo(
    () => detailsOf([...saveRefused, ...entries.filter((e) => e.group === 'server')]),
    [saveRefused, entries],
  );
  // how many texts of the draft still lack a language: the number the translations show
  const textsMissing = useMemo(() => (draft ? missingTextCount(textsOf(draft)) : 0), [draft]);
  // nothing left to list: the list is closed, and stays so when a problem comes back
  if (listing && entries.length === 0) setListing(false);

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
  const linkManager = Boolean(me && canManagePublicLink(me));
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
    // a publish that failed without naming anything is said above the panes until the next change
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
    // a question with no text yet goes by the name the canvas gives it
    return field ? localized(field.label, locale) || t('publish_list.unnamed_question') : null;
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
  /**
   * Adds an empty question of a type and leaves it chosen, in view, and with the cursor in its
   * Bengali text: after the question it follows (in a list's rows when that one is in them), at
   * the end of a list's rows, at a dropped place, else at the end of the section. One step to undo.
   */
  const addQuestion = (
    type: FieldType,
    place: { section: string; after?: string; group?: string; at?: number },
  ) => {
    if (mode !== 'full') return;
    const added = addOwnQuestion(
      draft,
      place.section,
      {
        type,
        ...(place.after === undefined ? {} : { after: place.after }),
        ...(place.group === undefined ? {} : { group: place.group }),
        // a table starts with one row and one column
        ...(type === 'number_table'
          ? { table: startTable(t('table_row', { n: '1' }), t('table_col', { n: '1' })) }
          : {}),
      },
      place.at,
    );
    if (!added.fieldKey) return;
    change(added.definition);
    const chosen = { section: place.section, field: added.fieldKey };
    setSelected(chosen);
    setReveal({ ...chosen, quiet: true });
    setTyping(added.fieldKey);
  };
  const newSectionTitle = (n: number) => ({
    bn: t('section_n_bn', { n: String(n) }),
    en: t('section_n_en', { n: String(n) }),
  });
  // a beneficiary application form that still lacks identity questions is offered them all in
  // one press, once the library they come from is read
  const identityMissing =
    mode === 'full' &&
    kind === 'beneficiary_application' &&
    lib.isSuccess &&
    missingIdentityRoles(draft).length > 0;
  const startWording = (name: CoreFieldKey | MobileOwnerWording | GuardianRelationWording) => ({
    bn: t(`identity.wording.${name}_bn`),
    en: t(`identity.wording.${name}_en`),
  });
  /** The added questions as one step to undo, the first of them chosen and in view. */
  const placeAdded = (added: {
    definition: FormDefinition;
    section: string | null;
    fieldKeys: string[];
  }) => {
    const first = added.fieldKeys[0];
    if (added.section === null || first === undefined) return;
    change(added.definition);
    setListing(false);
    const chosen = { section: added.section, field: first };
    setSelected(chosen);
    setReveal(chosen);
  };
  /**
   * Adds the identity questions the form lacks, the library's where it has them and a worded one
   * otherwise, with the two questions on whose number the mobile is, and leaves the first of
   * them chosen and in view. One step to undo.
   */
  const addIdentity = () => {
    if (!identityMissing) return;
    placeAdded(
      addIdentityQuestions(draft, fields, { kind, title: newSectionTitle, wording: startWording }),
    );
  };
  // a form that asks the mobile and not whose number it is, is offered the two questions for it
  // on its mobile question, once the library they may come from is read
  const mobileOwnerMissing =
    mode === 'full' &&
    kind === 'beneficiary_application' &&
    lib.isSuccess &&
    lacksMobileOwnerQuestion(draft);
  /**
   * Adds the two questions on whose number the mobile is right after the mobile question, and
   * leaves the first of them chosen and in view. One step to undo.
   */
  const addMobileOwner = () => {
    if (!mobileOwnerMissing) return;
    placeAdded(addMobileOwnerQuestions(draft, fields, { wording: startWording }));
  };
  /** Sends a question to the end of another part, where it stays chosen and comes into view. */
  const moveTo = (fieldKey: string, sectionKey: string) => {
    const next = moveFieldTo(draft, fieldKey, sectionKey, Number.MAX_SAFE_INTEGER);
    if (next === draft || mode !== 'full') return;
    change(next);
    const moved = { section: sectionKey, field: fieldKey };
    // the question was the chosen one already, so its settings are not opened over the form again
    setSelectedOnly(moved);
    setPane('question');
    setReveal(moved);
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
  // why the draft is not saved: what happens next when the save is tried again by itself,
  // otherwise the server's own words
  const saveDetail =
    save.failure === null
      ? null
      : save.failure.kind === 'retrying'
        ? t(online ? 'save_will_retry' : 'save_offline')
        : save.failure.message;
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
  // where there is no list (a phone, a published version), a refused save's message that names
  // no question and no part of the draft shows above the outline
  const named = new Set(draft.sections.flatMap((s) => [s.key, ...s.fields.map((f) => f.fieldKey)]));
  const unplaced = canPublish
    ? []
    : Object.entries(errors).flatMap(([key, messages]) => (named.has(key) ? [] : messages));
  const published = versions.data?.find((v) => v.status === 'published') ?? null;
  // what the check of the draft finds, the server would refuse too; what only the server said
  // is for the server to say again, so it does not hold Publish back
  const blocked = entries.some((e) => e.group !== 'server');
  /** Shows the place of a line of the list: the question or the part, or the points of the score. */
  const go = (place: EntryTarget) => {
    setListing(false);
    if (place === 'scoring') {
      setScoring(true);
      return;
    }
    setSelected(place);
    setReveal(place);
  };
  // a draft is published at the version it was saved at, so publishing waits for the save
  const publishWaits = save.state !== 'saved';
  const canStartNext =
    builder && !phone && !placed && version.status === 'published' && !form?.draftVersionId;
  // a refusal that names nothing shows above the panes: any refused new version, and a failed
  // publish whose answer names no place for the list
  const failure = [
    refusalOf(publish.error).length ? null : publish.error,
    next.error,
    take.error,
  ].find((e): e is ApiFailure => e instanceof ApiFailure);

  const outline = (
    <FormCanvas
      definition={draft}
      mode={mode}
      errors={errors}
      problems={problems}
      reveal={reveal}
      onRevealed={() => setReveal(null)}
      selected={selection}
      onSelect={setSelected}
      onChange={change}
      onRemoveField={remove}
      onRemoveSection={removeSection}
      onCopyField={copy}
      onMoveFieldTo={moveTo}
      onAddTo={(sectionKey, type) => addQuestion(type, { section: sectionKey })}
      onAddSection={() => {
        const made = addEmptySection(draft, newSectionTitle);
        change(made.definition);
        setSelected({ section: made.key });
      }}
      onAddIdentity={identityMissing ? addIdentity : undefined}
      onAddRow={(groupKey, type) => {
        const section = sectionOf(groupKey);
        if (section) addQuestion(type, { section: section.key, group: groupKey });
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
        focusText={typing}
        onTextFocused={() => setTyping(null)}
        onAddMobileOwner={mobileOwnerMissing ? addMobileOwner : undefined}
        onChange={change}
      />
    );

  const settingsTabs = (
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
  );
  const addFolded = folds.isFolded('add');
  const settingsFolded = folds.isFolded('settings');

  const panes = (
    <div className="fb-panes">
      {mode === 'full' && lib.data ? (
        <aside
          className={`fb-side fb-add${addFolded ? ' is-folded' : ''}`}
          aria-label={t('add_pane')}
        >
          <span className="fb-fold">
            <IconButton
              size="small"
              label={t(addFolded ? 'unfold_add' : 'fold_add')}
              icon={addFolded ? 'chevron-right' : 'chevron-left'}
              onClick={() => folds.toggle('add')}
            />
          </span>
          {/* folded, the pane keeps its tab, its search and its open groups for when it is back */}
          <div className="fb-side-body" hidden={addFolded}>
            <AddPane
              library={lib.data}
              fields={fields}
              definition={draft}
              targetSection={target}
              onAddSection={(s) => change(addLibrarySection(draft, s, fields))}
              onAddField={(key) => {
                if (!target) return;
                const placed = fields.get(key) ?? [];
                const next = addLibraryField(draft, target, placed);
                if (next === draft) return;
                change(next);
                // the question that came is chosen and shown: a list with its row questions by itself
                const first = placed.find((f) => !named.has(f.fieldKey));
                if (!first) return;
                const added = { section: target, field: first.fieldKey };
                setSelected(added);
                setReveal(added);
              }}
              onAddType={(type) => {
                // after the chosen question (a list or one of its row questions takes it into the
                // rows), else at the end of the chosen part, else of the last one
                if (selection?.field)
                  addQuestion(type, { section: selection.section, after: selection.field });
                else if (target) addQuestion(type, { section: target });
              }}
            />
          </div>
        </aside>
      ) : null}

      <div className="fb-canvas">{outline}</div>
      {narrow ? null : (
        <aside
          className={`fb-side fb-settings${settingsFolded ? ' is-folded' : ''}`}
          aria-label={t('settings')}
        >
          <span className="fb-fold">
            <IconButton
              size="small"
              label={t(settingsFolded ? 'unfold_settings' : 'fold_settings')}
              icon={settingsFolded ? 'chevron-left' : 'chevron-right'}
              onClick={() => folds.toggle('settings')}
            />
          </span>
          {settingsFolded ? null : <div className="fb-side-body">{settingsTabs}</div>}
        </aside>
      )}
      <Drawer open={settingsOver && drawer} onClose={() => setDrawer(false)} title={t('settings')}>
        {settingsTabs}
      </Drawer>
    </div>
  );
  const panesWithDrag =
    mode === 'full' ? (
      <CanvasDnd
        definition={draft}
        onChange={change}
        onDropType={(type, section, at) => addQuestion(type, { section, at })}
        onDragging={setDragging}
      >
        {panes}
      </CanvasDnd>
    ) : (
      panes
    );

  return (
    <div className="fb-page">
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
              {mode === 'read' ? null : (
                <Button
                  variant="secondary"
                  startIcon="globe"
                  ariaLabel={
                    textsMissing > 0
                      ? t('translations.button_missing', { n: String(textsMissing) })
                      : undefined
                  }
                  onClick={() => setTranslating({ missing: false })}
                >
                  {t('translations.button')}
                  {textsMissing > 0 ? (
                    <span className="fb-count" aria-hidden="true">
                      {textsMissing}
                    </span>
                  ) : null}
                </Button>
              )}
              {canStartNext ? (
                <Button onClick={() => next.mutate()} loading={next.isPending}>
                  {t('new_version')}
                </Button>
              ) : null}
              {canPublish ? (
                <PublishChecklist
                  entries={entries}
                  definition={draft}
                  open={listing}
                  onOpen={() => setListing(true)}
                  onClose={() => setListing(false)}
                  onGo={go}
                  actions={{
                    ...(identityMissing
                      ? { identity: { label: t('identity.add_all'), onSelect: addIdentity } }
                      : {}),
                    // the missing texts are written in one place, opened on them alone
                    texts: {
                      label: t('translations.open'),
                      onSelect: () => {
                        setListing(false);
                        setTranslating({ missing: true });
                      },
                    },
                  }}
                />
              ) : null}
              {canPublish ? (
                // a disabled button takes no pointer, so the reason hangs on the wrap around it
                <span className="fb-publish" title={publishWaits ? t('publish_wait') : undefined}>
                  <Button
                    onClick={() => {
                      // with something left to fix the list says so, with nothing the question
                      if (blocked) setListing(true);
                      else {
                        publish.reset();
                        setPublishing(true);
                      }
                    }}
                    // the confirmation lists what changed, so it waits for the versions too
                    disabled={publishWaits || !etag || !versions.isSuccess}
                  >
                    {t('publish')}
                  </Button>
                  {publishWaits ? <span className="app-sr-only">{t('publish_wait')}</span> : null}
                </span>
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
            <>
              <p
                className={`fb-save${save.state === 'failed' ? ' is-failed' : ''}`}
                aria-live="polite"
              >
                {save.state === 'failed' ? <Icon name="error" size={16} /> : null}
                <span>{saveLabel}</span>
                {saveDetail ? <span>{saveDetail}</span> : null}
              </p>
              {save.failure && save.failure.kind !== 'draft' ? (
                <Button size="small" variant="secondary" startIcon="refresh" onClick={save.retry}>
                  {t('save_retry')}
                </Button>
              ) : null}
            </>
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
          {/* without a settings column the form's own settings open from here */}
          {settingsOver ? (
            <Button
              size="small"
              variant="secondary"
              startIcon="settings"
              onClick={() => {
                setPane('form');
                setDrawer(true);
              }}
            >
              {t('form_settings')}
            </Button>
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
      {unplaced.map((message) => (
        <Alert key={message} tone="error">
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
      {translating && mode !== 'read' ? (
        <TranslationsDialog
          definition={draft}
          onlyMissing={translating.missing}
          onChange={change}
          onClose={() => setTranslating(null)}
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
        open={save.leave.asking}
        onClose={save.leave.stay}
        actions={
          <>
            <Button variant="secondary" onClick={save.leave.go}>
              {t('leave_confirm')}
            </Button>
            <Button onClick={save.leave.stay}>{t('leave_stay')}</Button>
          </>
        }
      >
        <Text>{t(save.leave.saving ? 'leave_saving_message' : 'leave_message')}</Text>
      </Dialog>
    </div>
  );
}
