import { programCode, SHORT_DESCRIPTION_MAX } from '@css/shared/projects';
import { Button, Dialog, Form, FormTextField, Switch } from '@/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { ApiFailure } from '../../api/client';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import { ScanNotCleared } from '../../lib/uploads';
import { CoverField, saveCover } from '../projects/CoverField';
import { type PanelUser, UserSearch, usersWithRole } from '../UserSearch';
import {
  assignPm,
  createProgram,
  type Program,
  PROGRAMS_KEY,
  programWithEtag,
  refreshProgramReads,
  updateProgram,
} from './programs-api';

type ProgramFields = {
  code: string;
  name: { bn: string; en: string };
  description: { bn: string; en: string };
  active: boolean;
  pm: PanelUser | null;
};

/** What a program's card adds to the program: its short description and its cover. */
export type ProgramLook = {
  description: { bn: string; en: string } | null;
  coverFileId: string | null;
};

/**
 * Creates a program (code, name in both languages, a short description, an optional PM and a
 * cover) or edits one: its name, description, whether it is active, its PM and its cover. A
 * program is never deleted; the server refuses to deactivate one with an open project and to give
 * it a PM without the Program Manager role. The cover is uploaded once the program is saved; a
 * cover that cannot be set leaves the saved program as it is and is reported to the caller.
 */
export function ProgramDialog({
  program,
  look,
  open,
  onClose,
  onDone,
}: {
  /** The program to edit; absent for a new one. */
  program?: Program;
  /** The description and the cover of the program to edit, from its card. */
  look?: ProgramLook;
  open: boolean;
  onClose: () => void;
  onDone: (program: Program, coverProblem?: string) => void;
}) {
  const t = useTranslations('admin.programs.dialog');
  const tc = useTranslations('common.action');
  const ts = useTranslations('common.state.error');
  const tcover = useTranslations('admin.projects.cover');
  const [cover, setCover] = useState<File | null>(null);
  const creating = !program;
  const codeInvalid = t('code_invalid');
  // a new program's code is checked before sending; an edit sends no code
  const schema = useMemo(
    () =>
      z
        .object({
          code: z.string(),
          name: z.object({ bn: z.string(), en: z.string() }),
          description: z.object({
            bn: z.string().max(SHORT_DESCRIPTION_MAX),
            en: z.string().max(SHORT_DESCRIPTION_MAX),
          }),
          active: z.boolean(),
          pm: z.custom<PanelUser | null>(),
        })
        .superRefine((v, ctx) => {
          if (creating && !programCode.safeParse(v.code).success)
            ctx.addIssue({ code: 'custom', path: ['code'], message: codeInvalid });
        }),
    [creating, codeInvalid],
  );
  const form = useForm<ProgramFields>({
    resolver: useSchemaResolver(schema),
    defaultValues: {
      code: '',
      name: { bn: program?.name.bn ?? '', en: program?.name.en ?? '' },
      description: { bn: look?.description?.bn ?? '', en: look?.description?.en ?? '' },
      active: program?.active ?? true,
      pm: program?.pmUserId
        ? { id: program.pmUserId, displayName: program.pmName ?? '', designation: null, roles: [] }
        : null,
    },
    reValidateMode: 'onSubmit',
  });
  const values = useWatch({ control: form.control });
  const pending = form.formState.isSubmitting;
  const queryClient = useQueryClient();
  // the version this edit started from: a change by someone else meanwhile answers 412
  const version = useQuery({
    queryKey: [...PROGRAMS_KEY, 'one', program?.id],
    queryFn: () => programWithEtag(program!.id),
    enabled: Boolean(program),
    staleTime: Infinity,
  });

  const store = async ({ code, name: typed, description, active, pm }: ProgramFields) => {
    const name = { bn: typed.bn.trim(), en: typed.en.trim() };
    const text = { bn: description.bn.trim(), en: description.en.trim() };
    const described = Boolean(text.bn || text.en);
    if (!program)
      return createProgram({
        code,
        name,
        ...(described ? { description: text } : {}),
        ...(pm ? { pmUserId: pm.id } : {}),
      });
    let saved = program;
    // the rename first: assigning the PM changes the program's version as well
    const renamed = name.bn !== program.name.bn || name.en !== program.name.en;
    const before = { bn: look?.description?.bn ?? '', en: look?.description?.en ?? '' };
    const redescribed = text.bn !== before.bn || text.en !== before.en;
    if (renamed || redescribed || active !== program.active)
      saved = await updateProgram(program.id, version.data!.meta.etag, {
        ...(renamed ? { name } : {}),
        ...(redescribed ? { description: described ? text : null } : {}),
        ...(active !== program.active ? { active } : {}),
      });
    if (pm && pm.id !== program.pmUserId) saved = await assignPm(program.id, pm.id);
    return saved;
  };
  const save = async (fields: ProgramFields) => {
    // Enter in a field submits too: it sends only what the button would
    if (!ready) return;
    let saved: Program;
    try {
      saved = await store(fields);
    } catch (failure) {
      showFailure(form, failure, ts('text'));
      return;
    } finally {
      // a save that stopped halfway still changed the program: the list and the cards show what
      // is stored
      void refreshProgramReads(queryClient);
    }
    let coverProblem: string | undefined;
    if (cover)
      try {
        await saveCover('program', saved.id, cover);
        await refreshProgramReads(queryClient);
      } catch (failure) {
        coverProblem = tcover('failed', {
          reason:
            failure instanceof ScanNotCleared
              ? tcover('not_cleared')
              : failure instanceof ApiFailure
                ? failure.message
                : ts('text'),
        });
      }
    onDone(saved, coverProblem);
  };
  const ready =
    values.name?.bn?.trim() !== '' &&
    values.name?.en?.trim() !== '' &&
    (program ? version.data !== undefined : values.code !== '');
  const title = program ? t('edit_title', { code: program.code }) : t('create_title');
  return (
    <Dialog
      title={title}
      open={open}
      onClose={onClose}
      dismissible={!pending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {tc('cancel')}
          </Button>
          <Button
            onClick={() => void form.handleSubmit(save)()}
            disabled={!ready}
            loading={pending}
          >
            {tc('save')}
          </Button>
        </>
      }
    >
      <Form
        form={form}
        onSubmit={save}
        label={title}
        error={form.formState.errors.root?.server?.message}
      >
        {!program && (
          <FormTextField
            name="code"
            label={t('code')}
            hint={t('code_hint')}
            required
            maxLength={12}
          />
        )}
        <FormTextField name="name.bn" label={t('name_bn')} required maxLength={200} />
        <FormTextField name="name.en" label={t('name_en')} required maxLength={200} lang="en" />
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
        <Controller
          control={form.control}
          name="pm"
          render={({ field }) => (
            <UserSearch
              label={t('pm')}
              helper={t('pm_hint')}
              selected={field.value}
              onSelect={field.onChange}
              search={{ key: 'program-managers', find: usersWithRole('program_manager') }}
            />
          )}
        />
        {program && (
          <Controller
            control={form.control}
            name="active"
            render={({ field }) => (
              <Switch label={t('active')} checked={field.value} onChange={field.onChange} />
            )}
          />
        )}
        <CoverField
          current={look?.coverFileId ?? null}
          seed={program?.id}
          value={cover}
          onChange={setCover}
        />
      </Form>
    </Dialog>
  );
}
