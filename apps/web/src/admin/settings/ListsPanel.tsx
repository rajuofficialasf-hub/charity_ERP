import { PLATFORM_KINDS, type PlatformKind } from '@css/shared';
import { type Locale, localized } from '@css/shared/i18n';
import {
  EDITABLE_LISTS,
  type EditableList,
  LISTS_WITH_KIND,
  listCodeSchema,
} from '@css/shared/settings';
import {
  Alert,
  Button,
  Card,
  Chip,
  DataTable,
  Dialog,
  Form,
  FormSelectField,
  FormTextField,
  IconButton,
  Stack,
  Switch,
  type DataTableExtendedColumn,
} from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import { addItem, listKey, type ReferenceItem, referenceItems, updateItem } from './settings-api';
import { LoadError } from '../../components/LoadError';
import { NameVariantsCard } from './NameVariantsCard';

type ItemFields = {
  code: string;
  label: { bn: string; en: string };
  /** The place in the list as typed, digits only; empty puts the item at the end. */
  sortOrder: string;
  active: boolean;
  kind: PlatformKind | '';
};

/**
 * Adds an item (code and labels, and a platform's kind) or edits one (labels, order, on or off,
 * kind); the code never changes, and an entry the rules need stays on.
 */
function ItemDialog({
  list,
  item,
  onClose,
  onDone,
}: {
  list: EditableList;
  item?: ReferenceItem;
  onClose: () => void;
  onDone: (item: ReferenceItem) => void;
}) {
  const t = useTranslations('admin.settings.lists');
  const tc = useTranslations('common.action');
  const ts = useTranslations('common.state.error');
  const locale = useLocale() as Locale;
  const withKind = LISTS_WITH_KIND.includes(list);
  const creating = !item;
  const codeInvalid = t('dialog.code_invalid');
  // both names, a new item's code in its shape, and a platform's kind
  const schema = useMemo(
    () =>
      z
        .object({
          code: z.string(),
          label: z.object({ bn: z.string(), en: z.string() }),
          sortOrder: z.string(),
          active: z.boolean(),
          kind: z.enum(PLATFORM_KINDS).or(z.literal('')),
        })
        .superRefine((v, ctx) => {
          const required = (path: string[]) =>
            ctx.addIssue({ code: 'custom', path, message: 'validation.required' });
          if (!v.label.bn.trim()) required(['label', 'bn']);
          if (!v.label.en.trim()) required(['label', 'en']);
          if (creating && !v.code) required(['code']);
          else if (creating && !listCodeSchema.safeParse(v.code).success)
            ctx.addIssue({ code: 'custom', path: ['code'], message: codeInvalid });
          if (withKind && !v.kind) required(['kind']);
        }),
    [creating, withKind, codeInvalid],
  );
  const form = useForm<ItemFields>({
    resolver: useSchemaResolver(schema),
    defaultValues: {
      code: '',
      label: { bn: item?.label.bn ?? '', en: item?.label.en ?? '' },
      sortOrder: item ? String(item.sortOrder) : '',
      active: item?.active ?? true,
      kind: item?.kind ?? '',
    },
    reValidateMode: 'onSubmit',
  });
  const values = useWatch({ control: form.control });
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: ({ code, label: typed, sortOrder: order, active, kind }: ItemFields) => {
      const label = { bn: typed.bn.trim(), en: typed.en.trim() };
      const sortOrder = order.trim() === '' ? undefined : Number(order);
      const extra = {
        ...(sortOrder === undefined ? {} : { sortOrder }),
        ...(withKind && kind ? { kind } : {}),
      };
      return item
        ? updateItem(list, item.code, { label, ...(item.system ? {} : { active }), ...extra })
        : addItem(list, { code, label, ...extra });
    },
    onSuccess: onDone,
    // the names' message stands under the first of them
    onError: (failure) => showFailure(form, failure, ts('text'), { groups: { label: 'label.bn' } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey(list) }),
  });
  // the button waits for both names, a new item's code and a platform's kind; its format is
  // checked on sending
  const ready =
    !!values.label?.bn?.trim() &&
    !!values.label?.en?.trim() &&
    (!creating || !!values.code) &&
    (!withKind || !!values.kind);
  // the button's own path, and nothing twice while a save is on its way
  const send = (fields: ItemFields) => {
    if (ready && !save.isPending) save.mutate(fields);
  };
  const title = item
    ? t('dialog.edit_title', { name: localized(item.label, locale) })
    : t('dialog.create_title', { list: t(list) });
  return (
    <Dialog
      title={title}
      open
      onClose={onClose}
      dismissible={!save.isPending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            {tc('cancel')}
          </Button>
          <Button
            onClick={() => void form.handleSubmit(send)()}
            disabled={!ready}
            loading={save.isPending}
          >
            {tc('save')}
          </Button>
        </>
      }
    >
      <Form
        form={form}
        onSubmit={send}
        label={title}
        error={form.formState.errors.root?.server?.message}
      >
        {!item && (
          <FormTextField
            name="code"
            label={t('dialog.code')}
            hint={t('dialog.code_hint')}
            required
            lang="en"
            maxLength={64}
          />
        )}
        <FormTextField name="label.bn" label={t('dialog.label_bn')} required maxLength={200} />
        <FormTextField
          name="label.en"
          label={t('dialog.label_en')}
          required
          maxLength={200}
          lang="en"
        />
        <FormTextField
          name="sortOrder"
          label={t('dialog.order')}
          hint={t('dialog.order_hint')}
          inputMode="numeric"
          maxLength={5}
          normalize={(v) => v.replace(/[^0-9]/g, '')}
        />
        {withKind && (
          <FormSelectField
            name="kind"
            label={t('dialog.kind')}
            hint={t('dialog.kind_hint')}
            required
            options={PLATFORM_KINDS.map((k) => ({ value: k, label: t(`kind.${k}`) }))}
          />
        )}
        {item && !item.system && (
          <Controller
            control={form.control}
            name="active"
            render={({ field }) => (
              <Switch label={t('dialog.active')} checked={field.value} onChange={field.onChange} />
            )}
          />
        )}
        {item?.system && (
          <Alert tone="info" title={t('dialog.system')}>
            {t('dialog.system_hint')}
          </Alert>
        )}
      </Form>
    </Dialog>
  );
}

/** On or off, and a lock on an entry the rules need. */
function ItemState({ item }: { item: ReferenceItem }) {
  const t = useTranslations('admin.settings.lists');
  return item.system ? (
    <Chip tone="info">{t('state.system')}</Chip>
  ) : (
    <Chip tone={item.active ? 'success' : 'neutral'}>
      {item.active ? t('state.active') : t('state.inactive')}
    </Chip>
  );
}

/** One editable list: its items in order, inactive ones marked, with add and edit. */
function ListCard({ list, onNotice }: { list: EditableList; onNotice: (text: string) => void }) {
  const t = useTranslations('admin.settings.lists');
  const locale = useLocale() as Locale;
  const items = useQuery({ queryKey: listKey(list), queryFn: () => referenceItems(list) });
  const [dialog, setDialog] = useState<{ item?: ReferenceItem } | null>(null);
  const name = (i: ReferenceItem) => localized(i.label, locale);
  const columns: DataTableExtendedColumn<ReferenceItem>[] = [
    { id: 'label', header: t('column.label'), cell: name, isRowHeader: true },
    {
      id: 'code',
      header: t('column.code'),
      cell: (i) => <span lang="en">{i.code}</span>,
      priority: 2,
    },
    { id: 'order', header: t('column.order'), cell: (i) => i.sortOrder, priority: 3 },
    ...(LISTS_WITH_KIND.includes(list)
      ? [
          {
            id: 'kind',
            header: t('column.kind'),
            cell: (i: ReferenceItem) => (i.kind ? t(`kind.${i.kind}`) : null),
            priority: 2,
          } satisfies DataTableExtendedColumn<ReferenceItem>,
        ]
      : []),
    { id: 'state', header: t('column.state'), cell: (i) => <ItemState item={i} /> },
  ];
  const edit = (i: ReferenceItem) => (
    <IconButton
      label={t('edit', { name: name(i) })}
      icon="edit"
      onClick={() => setDialog({ item: i })}
    />
  );
  return (
    <Card
      title={t(list)}
      headingLevel={2}
      action={
        <Button variant="secondary" size="small" onClick={() => setDialog({})}>
          {t('add')}
        </Button>
      }
    >
      <DataTable
        label={t(list)}
        columns={columns}
        rows={items.data ?? []}
        getRowId={(i) => i.code}
        rowLabel={name}
        loading={items.isPending}
        error={
          items.error ? (
            <LoadError error={items.error} onRetry={() => void items.refetch()} />
          ) : undefined
        }
        emptyTitle={t('empty')}
        rowActions={edit}
        cardRenderer={(i) => (
          <div className="admin-permission-card">
            <strong>{name(i)}</strong>
            <span lang="en">{i.code}</span>
            <ItemState item={i} />
          </div>
        )}
      />
      {dialog && (
        <ItemDialog
          key={dialog.item?.code ?? 'new'}
          list={list}
          item={dialog.item}
          onClose={() => setDialog(null)}
          onDone={(saved) => {
            setDialog(null);
            onNotice(t('saved', { name: name(saved) }));
          }}
        />
      )}
    </Card>
  );
}

/**
 * The expense categories, the issue types and the Media Team's stages, production roles and
 * platforms, and the spelling variants of names; nothing is deleted, an item is switched off instead.
 */
export function ListsPanel({ onNotice }: { onNotice: (text: string) => void }) {
  const t = useTranslations('admin.settings.lists');
  return (
    <Stack gap={4}>
      <p className="admin-muted">{t('intro')}</p>
      {EDITABLE_LISTS.map((list) => (
        <ListCard key={list} list={list} onNotice={onNotice} />
      ))}
      <NameVariantsCard onNotice={onNotice} />
    </Stack>
  );
}
