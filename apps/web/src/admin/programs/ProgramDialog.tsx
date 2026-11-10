import { programCode } from '@css/shared/projects';
import { Button, Dialog, Form, FormTextField, Switch } from '@/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import { type PanelUser, UserSearch, usersWithRole } from '../UserSearch';
import {
  assignPm,
  createProgram,
  type Program,
  PROGRAMS_KEY,
  programWithEtag,
  updateProgram,
} from './programs-api';

type ProgramFields = {
  code: string;
  name: { bn: string; en: string };
  active: boolean;
  pm: PanelUser | null;
};

/**
 * Creates a program (code, name in both languages, an optional PM) or edits one: its name, whether
 * it is active, and its PM. A program is never deleted; the server refuses to deactivate one with
 * an open project and to give it a PM without the Program Manager role.
 */
export function ProgramDialog({
  program,
  open,
  onClose,
  onDone,
}: {
  /** The program to edit; absent for a new one. */
  program?: Program;
  open: boolean;
  onClose: () => void;
  onDone: (program: Program) => void;
}) {
  const t = useTranslations('admin.programs.dialog');
  const tc = useTranslations('common.action');
  const ts = useTranslations('common.state.error');
  const creating = !program;
  const codeInvalid = t('code_invalid');
  // a new program's code is checked before sending; an edit sends no code
  const schema = useMemo(
    () =>
      z
        .object({
          code: z.string(),
          name: z.object({ bn: z.string(), en: z.string() }),
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

  const store = async ({ code, name: typed, active, pm }: ProgramFields) => {
    const name = { bn: typed.bn.trim(), en: typed.en.trim() };
    if (!program) return createProgram({ code, name, ...(pm ? { pmUserId: pm.id } : {}) });
    let saved = program;
    // the rename first: assigning the PM changes the program's version as well
    const renamed = name.bn !== program.name.bn || name.en !== program.name.en;
    if (renamed || active !== program.active)
      saved = await updateProgram(program.id, version.data!.meta.etag, {
        ...(renamed ? { name } : {}),
        ...(active !== program.active ? { active } : {}),
      });
    if (pm && pm.id !== program.pmUserId) saved = await assignPm(program.id, pm.id);
    return saved;
  };
  const save = async (fields: ProgramFields) => {
    let saved: Program;
    try {
      saved = await store(fields);
    } catch (failure) {
      showFailure(form, failure, ts('text'));
      return;
    } finally {
      // a save that stopped halfway still changed the program: the list shows what is stored
      void queryClient.invalidateQueries({ queryKey: PROGRAMS_KEY });
    }
    onDone(saved);
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
      </Form>
    </Dialog>
  );
}
