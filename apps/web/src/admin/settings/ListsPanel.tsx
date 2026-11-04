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
  IconButton,
  SelectField,
  Stack,
  Switch,
  TextField,
  type DataTableExtendedColumn,
} from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { addItem, listKey, type ReferenceItem, referenceItems, updateItem } from './settings-api';
import { LoadError } from '../../components/LoadError';

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
  const locale = useLocale() as Locale;
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string>();
  const [bn, setBn] = useState(item?.label.bn ?? '');
  const [en, setEn] = useState(item?.label.en ?? '');
  const [order, setOrder] = useState(item ? String(item.sortOrder) : '');
  const [active, setActive] = useState(item?.active ?? true);
  const withKind = LISTS_WITH_KIND.includes(list);
  const [kind, setKind] = useState<PlatformKind | null>(item?.kind ?? null);
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () => {
      const label = { bn: bn.trim(), en: en.trim() };
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
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey(list) }),
  });
  const failure = save.error instanceof ApiFailure ? save.error : undefined;
  const detail = (path: string) => failure?.details.find((d) => d.path === path)?.message;
  const submit = () => {
    if (!item && !listCodeSchema.safeParse(code).success) {
      setCodeError(t('dialog.code_invalid'));
      return;
    }
    setCodeError(undefined);
    save.mutate();
  };
  return (
    <Dialog
      title={
        item
          ? t('dialog.edit_title', { name: localized(item.label, locale) })
          : t('dialog.create_title', { list: t(list) })
      }
      open
      onClose={onClose}
      dismissible={!save.isPending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            {tc('cancel')}
          </Button>
          <Button
            onClick={submit}
            disabled={!bn.trim() || !en.trim() || (!item && !code) || (withKind && !kind)}
            loading={save.isPending}
          >
            {tc('save')}
          </Button>
        </>
      }
    >
      {failure && !failure.details.length && <Alert tone="error">{failure.message}</Alert>}
      {!item && (
        <TextField
          label={t('dialog.code')}
          hint={t('dialog.code_hint')}
          required
          lang="en"
          maxLength={64}
          value={code}
          onChange={setCode}
          error={codeError ?? detail('code')}
        />
      )}
      <TextField
        label={t('dialog.label_bn')}
        required
        maxLength={200}
        value={bn}
        onChange={setBn}
        error={detail('label')}
      />
      <TextField
        label={t('dialog.label_en')}
        required
        maxLength={200}
        lang="en"
        value={en}
        onChange={setEn}
      />
      <TextField
        label={t('dialog.order')}
        hint={t('dialog.order_hint')}
        inputMode="numeric"
        maxLength={5}
        value={order}
        onChange={(v) => setOrder(v.replace(/[^0-9]/g, ''))}
        error={detail('sortOrder')}
      />
      {withKind && (
        <SelectField
          label={t('dialog.kind')}
          hint={t('dialog.kind_hint')}
          required
          value={kind ?? ''}
          options={PLATFORM_KINDS.map((k) => ({ value: k, label: t(`kind.${k}`) }))}
          onChange={(id) => setKind((id as PlatformKind) || null)}
          error={detail('kind')}
        />
      )}
      {item && !item.system && (
        <Switch label={t('dialog.active')} checked={active} onChange={setActive} />
      )}
      {item?.system && (
        <Alert tone="info" title={t('dialog.system')}>
          {t('dialog.system_hint')}
        </Alert>
      )}
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
  const tc = useTranslations('common');
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
            <Button variant="secondary" size="small" onClick={() => setDialog({ item: i })}>
              {tc('action.edit')}
            </Button>
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
 * platforms; nothing is deleted, an item is switched off instead.
 */
export function ListsPanel({ onNotice }: { onNotice: (text: string) => void }) {
  const t = useTranslations('admin.settings.lists');
  return (
    <Stack gap={4}>
      <p className="admin-muted">{t('intro')}</p>
      {EDITABLE_LISTS.map((list) => (
        <ListCard key={list} list={list} onNotice={onNotice} />
      ))}
    </Stack>
  );
}
