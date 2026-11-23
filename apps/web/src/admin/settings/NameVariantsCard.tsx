import { nameSpellingSchema, spellingKey } from '@css/shared/beneficiaries';
import {
  Button,
  Card,
  Chip,
  DataTable,
  Dialog,
  Form,
  FormTextField,
  IconButton,
  Switch,
  type DataTableExtendedColumn,
} from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { ApiFailure } from '../../api/client';
import { LoadError } from '../../components/LoadError';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import {
  addNameVariantGroup,
  NAME_VARIANTS_KEY,
  type NameVariantGroupView,
  nameVariantGroups,
  updateNameVariantGroup,
} from './settings-api';
import { DialogActions } from '../DialogActions';

type GroupFields = {
  canonical: string;
  /** The other spellings as typed: one per line, or separated by commas. */
  others: string;
  active: boolean;
};

/** The spellings of the "others" field, in the order they were typed. */
const spellingsOf = (others: string) =>
  others
    .split(/[\n,]/u)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Adds a group of spellings or edits one: the spelling the keys use, the others, and on or off.
 * Each spelling is checked as the API checks it; that a spelling is in another group comes back
 * from the server, under the field that holds it. An edit carries the version the list showed, so
 * a group another official changed meanwhile is refused with the server's message, and the list is
 * read again.
 */
function GroupDialog({
  group,
  onClose,
  onDone,
}: {
  group?: NameVariantGroupView;
  onClose: () => void;
  onDone: (group: NameVariantGroupView) => void;
}) {
  const t = useTranslations('admin.settings.name_variants');
  const tc = useTranslations('common.action');
  const ts = useTranslations('common.state.error');
  const te = useTranslations('errors');
  // the words of the others field are checked one by one; a refusal names the word it is about
  const schema = useMemo(() => {
    const say = (message: string) =>
      te.has(message as Parameters<typeof te>[0])
        ? te(message as Parameters<typeof te>[0])
        : message;
    return z
      .object({ canonical: nameSpellingSchema, others: z.string(), active: z.boolean() })
      .superRefine((v, ctx) => {
        const words = spellingsOf(v.others);
        if (!words.length) {
          ctx.addIssue({ code: 'custom', path: ['others'], message: 'validation.required' });
          return;
        }
        const seen = new Set([spellingKey(v.canonical)]);
        for (const word of words) {
          const checked = nameSpellingSchema.safeParse(word);
          const message = !checked.success
            ? checked.error.issues[0]!.message
            : seen.has(spellingKey(word))
              ? 'validation.name_variant_repeated'
              : undefined;
          if (message) {
            ctx.addIssue({
              code: 'custom',
              path: ['others'],
              message: t('dialog.word_error', { word, message: say(message) }),
            });
            return;
          }
          seen.add(spellingKey(word));
        }
      });
  }, [t, te]);
  const form = useForm<GroupFields>({
    resolver: useSchemaResolver(schema),
    defaultValues: {
      canonical: group?.canonical ?? '',
      others: group?.variants.join('\n') ?? '',
      active: group?.active ?? true,
    },
    reValidateMode: 'onSubmit',
  });
  const values = useWatch({ control: form.control });
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: ({ canonical, others, active }: GroupFields) => {
      const spellings = { canonical: canonical.trim(), variants: spellingsOf(others) };
      return group
        ? updateNameVariantGroup(group, { ...spellings, active })
        : addNameVariantGroup(spellings);
    },
    onSuccess: onDone,
    onError: (failure, sent) => {
      // the refusals of single spellings stand under the others field, each with its word
      if (failure instanceof ApiFailure) {
        const words = spellingsOf(sent.others);
        const ofOthers = failure.details.filter((d) => d.path?.startsWith('variants.'));
        if (ofOthers.length) {
          form.setError('others', {
            type: 'server',
            message: ofOthers
              .map((d) =>
                t('dialog.word_error', {
                  word: words[Number(d.path!.slice('variants.'.length))] ?? '',
                  message: d.message,
                }),
              )
              .join(' '),
          });
          for (const d of failure.details)
            if (d.path === 'canonical')
              form.setError('canonical', { type: 'server', message: d.message });
          if (failure.details.every((d) => d.path === 'canonical' || ofOthers.includes(d))) return;
        }
      }
      showFailure(form, failure, ts('text'));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: NAME_VARIANTS_KEY }),
  });
  // the button waits for the main spelling and at least one other
  const ready = !!values.canonical?.trim() && spellingsOf(values.others ?? '').length > 0;
  const send = (fields: GroupFields) => {
    if (ready && !save.isPending) save.mutate(fields);
  };
  const title = group
    ? t('dialog.edit_title', { name: group.canonical })
    : t('dialog.create_title');
  return (
    <Dialog
      title={title}
      open
      onClose={onClose}
      dismissible={!save.isPending}
      actions={
        <DialogActions
          cancelLabel={tc('cancel')}
          onCancel={onClose}
          submitLabel={tc('save')}
          onSubmit={() => void form.handleSubmit(send)()}
          pending={save.isPending}
          disabled={!ready}
        />
      }
    >
      <Form
        form={form}
        onSubmit={send}
        label={title}
        error={form.formState.errors.root?.server?.message}
      >
        <FormTextField
          name="canonical"
          label={t('dialog.canonical')}
          hint={t('dialog.canonical_hint')}
          required
          maxLength={100}
        />
        <FormTextField
          name="others"
          label={t('dialog.others')}
          hint={t('dialog.others_hint')}
          required
          rows={4}
        />
        {group && (
          <Controller
            control={form.control}
            name="active"
            render={({ field }) => (
              <Switch label={t('dialog.active')} checked={field.value} onChange={field.onChange} />
            )}
          />
        )}
      </Form>
    </Dialog>
  );
}

function GroupState({ group }: { group: NameVariantGroupView }) {
  const t = useTranslations('admin.settings.name_variants');
  return (
    <Chip tone={group.active ? 'success' : 'neutral'}>
      {group.active ? t('state.active') : t('state.inactive')}
    </Chip>
  );
}

/**
 * The spelling variants of names, which the name keys make equal when two people are compared: a
 * line per group with its main spelling, the others and whether it is on; a group is added and
 * edited in a dialog and switched off, never deleted.
 */
export function NameVariantsCard({ onNotice }: { onNotice: (text: string) => void }) {
  const t = useTranslations('admin.settings.name_variants');
  const groups = useQuery({ queryKey: NAME_VARIANTS_KEY, queryFn: nameVariantGroups });
  const [dialog, setDialog] = useState<{ group?: NameVariantGroupView } | null>(null);
  const others = (g: NameVariantGroupView) => g.variants.join(', ');
  const columns: DataTableExtendedColumn<NameVariantGroupView>[] = [
    {
      id: 'canonical',
      header: t('column.canonical'),
      cell: (g) => g.canonical,
      isRowHeader: true,
    },
    { id: 'others', header: t('column.others'), cell: others },
    { id: 'state', header: t('column.state'), cell: (g) => <GroupState group={g} /> },
  ];
  return (
    <Card
      title={t('title')}
      headingLevel={2}
      action={
        <Button variant="secondary" size="small" onClick={() => setDialog({})}>
          {t('add')}
        </Button>
      }
    >
      <p className="admin-muted">{t('intro')}</p>
      <DataTable
        label={t('title')}
        columns={columns}
        rows={groups.data ?? []}
        getRowId={(g) => g.id}
        rowLabel={(g) => g.canonical}
        loading={groups.isPending}
        error={
          groups.error ? (
            <LoadError error={groups.error} onRetry={() => void groups.refetch()} />
          ) : undefined
        }
        emptyTitle={t('empty')}
        rowActions={(g) => (
          <IconButton
            label={t('edit', { name: g.canonical })}
            icon="edit"
            onClick={() => setDialog({ group: g })}
          />
        )}
        cardRenderer={(g) => (
          <div className="admin-permission-card">
            <strong>{g.canonical}</strong>
            <span>{others(g)}</span>
            <GroupState group={g} />
          </div>
        )}
      />
      {dialog && (
        <GroupDialog
          key={dialog.group?.id ?? 'new'}
          group={dialog.group}
          onClose={() => setDialog(null)}
          onDone={(saved) => {
            setDialog(null);
            onNotice(t('saved', { name: saved.canonical }));
          }}
        />
      )}
    </Card>
  );
}
