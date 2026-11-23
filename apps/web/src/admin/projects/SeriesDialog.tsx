import { type Locale, localized } from '@css/shared/i18n';
import { projectCode, SHORT_DESCRIPTION_MAX } from '@css/shared/projects';
import { DescriptionList, Dialog, Form, FormTextField, Text } from '@/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import {
  CARDS_KEY,
  createSeries,
  type ProjectSeries,
  seriesWithEtag,
  updateSeries,
} from './cards-api';
import { CoverField, coverProblemReason, saveCover } from './CoverField';
import { PROJECTS_KEY } from './projects-api';
import { DialogActions } from '../DialogActions';

type SeriesFields = {
  code: string;
  name: { bn: string; en: string };
  description: { bn: string; en: string };
};

/** The fields as a stored series fills them. */
const fieldsOf = (record: ProjectSeries): SeriesFields => ({
  code: record.code,
  name: { bn: record.name.bn, en: record.name.en },
  description: { bn: record.description?.bn ?? '', en: record.description?.en ?? '' },
});

/** What the dialog saved, and why its cover could not be set, if it could not. */
export type SeriesSaved = { series: ProjectSeries; coverProblem?: string };

/**
 * A permanent project, a project series (docs/ui/SCREENS.md, "Project list and project page"):
 * a new one of a program (its code, its names, a short description and a cover; the program and
 * the code never change afterwards), or the edit of one (its names, description and cover, with
 * its version). The cover is uploaded once the series is saved; a cover that cannot be set leaves
 * the saved series as it is and is reported to the caller.
 */
export function SeriesDialog({
  program,
  seriesId,
  onClose,
  onDone,
}: {
  /** The program of a new series. */
  program?: { id: string; name: { bn: string; en: string } };
  /** The series to edit. */
  seriesId?: string;
  onClose: () => void;
  onDone: (saved: SeriesSaved) => void;
}) {
  const t = useTranslations('admin.projects.series_dialog');
  const td = useTranslations('admin.projects.dialog');
  const tc = useTranslations('common.action');
  const te = useTranslations('common.state.error');
  const tcover = useTranslations('admin.projects.cover');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const creating = !seriesId;
  const [cover, setCover] = useState<File | null>(null);
  // the version this edit starts from, read afresh at every opening (never a cached one, so an
  // edit refused as stale is opened again on what is stored now); a change by someone else
  // meanwhile answers 412
  const current = useQuery({
    queryKey: [...CARDS_KEY, 'series-record', seriesId],
    queryFn: () => seriesWithEtag(seriesId!),
    enabled: !creating,
    refetchOnMount: 'always',
    gcTime: 0,
  });
  const fresh = current.isFetchedAfterMount ? current.data : undefined;
  const record = fresh?.data;
  const codeInvalid = td('code_invalid');
  const schema = useMemo(
    () =>
      z
        .object({
          code: z.string(),
          name: z.object({ bn: z.string().trim().min(1), en: z.string().trim().min(1) }),
          description: z.object({
            bn: z.string().max(SHORT_DESCRIPTION_MAX),
            en: z.string().max(SHORT_DESCRIPTION_MAX),
          }),
        })
        .superRefine((v, ctx) => {
          if (creating && !projectCode.safeParse(v.code).success)
            ctx.addIssue({ code: 'custom', path: ['code'], message: codeInvalid });
        }),
    [creating, codeInvalid],
  );
  const form = useForm<SeriesFields>({
    resolver: useSchemaResolver(schema),
    defaultValues: { code: '', name: { bn: '', en: '' }, description: { bn: '', en: '' } },
    reValidateMode: 'onSubmit',
  });
  // the record fills the fields once, when the dialog opens: a read in the background never
  // replaces what is being typed
  const filled = useRef(false);
  useEffect(() => {
    if (record && !filled.current) {
      filled.current = true;
      form.reset(fieldsOf(record));
    }
  }, [record, form]);
  const values = useWatch({ control: form.control });
  const pending = form.formState.isSubmitting;
  // Enter in a field and the button both submit: one save at a time
  const running = useRef(false);

  const store = async (v: SeriesFields): Promise<ProjectSeries> => {
    const name = { bn: v.name.bn.trim(), en: v.name.en.trim() };
    const text = { bn: v.description.bn.trim(), en: v.description.en.trim() };
    const described = Boolean(text.bn || text.en);
    if (creating)
      return createSeries({
        programId: program!.id,
        code: v.code,
        name,
        ...(described ? { description: text } : {}),
      });
    const was = record!;
    const renamed = name.bn !== was.name.bn || name.en !== was.name.en;
    const before = { bn: was.description?.bn ?? '', en: was.description?.en ?? '' };
    const redescribed = text.bn !== before.bn || text.en !== before.en;
    if (!renamed && !redescribed) return was;
    return updateSeries(was.id, fresh!.meta.etag, {
      ...(renamed ? { name } : {}),
      ...(redescribed ? { description: described ? text : null } : {}),
    });
  };
  const save = async (v: SeriesFields) => {
    if (running.current) return;
    running.current = true;
    try {
      await saveOnce(v);
    } finally {
      running.current = false;
    }
  };
  const saveOnce = async (v: SeriesFields) => {
    let saved: ProjectSeries;
    try {
      saved = await store(v);
    } catch (failure) {
      showFailure(form, failure, te('text'));
      return;
    }
    let coverProblem: string | undefined;
    if (cover)
      try {
        await saveCover('project_series', saved.id, cover);
      } catch (failure) {
        coverProblem = tcover('failed', {
          reason: coverProblemReason(failure, tcover('not_cleared'), te('text')),
        });
      }
    // the cards, the program's projects and this series show what is stored
    await queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
    onDone({ series: saved, coverProblem });
  };
  const ready =
    values.name?.bn?.trim() !== '' &&
    values.name?.en?.trim() !== '' &&
    (creating ? values.code !== '' : record !== undefined);
  const title = creating ? t('create_title') : t('edit_title', { code: record?.code ?? '' });
  const programName = creating ? program!.name : record?.program.name;

  return (
    <Dialog
      title={title}
      open
      onClose={onClose}
      dismissible={!pending}
      actions={
        <DialogActions
          cancelLabel={tc('cancel')}
          onCancel={onClose}
          submitLabel={t('save')}
          onSubmit={() => void form.handleSubmit(save)()}
          pending={pending}
          disabled={!ready}
        />
      }
    >
      <Form
        form={form}
        onSubmit={save}
        label={title}
        error={form.formState.errors.root?.server?.message}
      >
        {programName && (
          <DescriptionList
            items={[
              { label: t('program'), value: localized(programName, locale) },
              ...(creating ? [] : [{ label: td('code'), value: record?.code ?? '' }]),
            ]}
          />
        )}
        {creating && (
          <FormTextField
            name="code"
            label={td('code')}
            hint={td('code_hint')}
            required
            maxLength={8}
          />
        )}
        <FormTextField name="name.bn" label={td('name_bn')} required maxLength={200} />
        <FormTextField name="name.en" label={td('name_en')} required maxLength={200} lang="en" />
        <FormTextField
          name="description.bn"
          label={t('description_bn')}
          rows={3}
          maxLength={SHORT_DESCRIPTION_MAX}
        />
        <FormTextField
          name="description.en"
          label={t('description_en')}
          rows={3}
          maxLength={SHORT_DESCRIPTION_MAX}
          lang="en"
        />
        <CoverField
          current={record?.coverFileId ?? null}
          seed={record?.id}
          value={cover}
          onChange={setCover}
        />
        {creating && <Text tone="muted">{t('first_session')}</Text>}
      </Form>
    </Dialog>
  );
}
