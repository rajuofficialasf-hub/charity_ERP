import { type Locale, localized } from '@css/shared/i18n';
import { EDITABLE_LISTS, type EditableList, listCodeSchema } from '@css/shared/settings';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Modal,
  Switch,
  Table,
  type TableColumn,
  TextField,
} from '@css/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { addItem, listKey, type ReferenceItem, referenceItems, updateItem } from './settings-api';

/** Adds an item (code and labels) or edits one (labels, order, on or off); the code never changes. */
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
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () => {
      const label = { bn: bn.trim(), en: en.trim() };
      const sortOrder = order.trim() === '' ? undefined : Number(order);
      return item
        ? updateItem(list, item.code, {
            label,
            active,
            ...(sortOrder === undefined ? {} : { sortOrder }),
          })
        : addItem(list, { code, label, ...(sortOrder === undefined ? {} : { sortOrder }) });
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
    <Modal
      title={
        item
          ? t('dialog.edit_title', { name: localized(item.label, locale) })
          : t('dialog.create_title', { list: t(list) })
      }
      isOpen
      onClose={onClose}
      dismissible={!save.isPending}
      secondaryAction={
        <Button variant="secondary" onPress={onClose} disabled={save.isPending}>
          {tc('cancel')}
        </Button>
      }
      primaryAction={
        <Button
          onPress={submit}
          disabled={!bn.trim() || !en.trim() || (!item && !code)}
          loading={save.isPending}
        >
          {tc('save')}
        </Button>
      }
    >
      {failure && !failure.details.length && (
        <Alert tone="danger" live="alert">
          {failure.message}
        </Alert>
      )}
      {!item && (
        <TextField
          label={t('dialog.code')}
          helper={t('dialog.code_hint')}
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
        helper={t('dialog.order_hint')}
        inputMode="numeric"
        maxLength={5}
        value={order}
        onChange={(v) => setOrder(v.replace(/[^0-9]/g, ''))}
        error={detail('sortOrder')}
      />
      {item && (
        <Switch isSelected={active} onChange={setActive}>
          {t('dialog.active')}
        </Switch>
      )}
    </Modal>
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
  const columns: TableColumn<ReferenceItem>[] = [
    { id: 'label', header: t('column.label'), cell: name, isRowHeader: true },
    {
      id: 'code',
      header: t('column.code'),
      cell: (i) => <span lang="en">{i.code}</span>,
      priority: 2,
    },
    { id: 'order', header: t('column.order'), cell: (i) => i.sortOrder, priority: 3 },
    {
      id: 'state',
      header: t('column.state'),
      cell: (i) => (
        <Badge
          tone={i.active ? 'success' : 'neutral'}
          label={i.active ? t('state.active') : t('state.inactive')}
        />
      ),
    },
  ];
  const edit = (i: ReferenceItem) => (
    <Button variant="ghost" size="sm" icon={Pencil} iconOnly onPress={() => setDialog({ item: i })}>
      {t('edit', { name: name(i) })}
    </Button>
  );
  return (
    <Card
      title={t(list)}
      headingLevel={2}
      actions={
        <Button variant="secondary" size="sm" onPress={() => setDialog({})}>
          {t('add')}
        </Button>
      }
    >
      <Table
        label={t(list)}
        columns={columns}
        rows={items.data ?? []}
        rowKey={(i) => i.code}
        rowLabel={name}
        loading={items.isPending}
        error={
          items.error ? (
            <ErrorState
              title={tc('state.error.text')}
              requestId={items.error instanceof ApiFailure ? items.error.requestId : undefined}
              onRetry={() => void items.refetch()}
            />
          ) : undefined
        }
        emptyState={<EmptyState icon={ListChecks} title={t('empty')} headingLevel={3} />}
        rowActions={edit}
        cardRenderer={(i) => (
          <div className="admin-permission-card">
            <strong>{name(i)}</strong>
            <span lang="en">{i.code}</span>
            <Badge
              tone={i.active ? 'success' : 'neutral'}
              label={i.active ? t('state.active') : t('state.inactive')}
            />
            <Button variant="secondary" size="sm" onPress={() => setDialog({ item: i })}>
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

/** The expense categories and the issue types; nothing is deleted, an item is switched off instead. */
export function ListsPanel({ onNotice }: { onNotice: (text: string) => void }) {
  const t = useTranslations('admin.settings.lists');
  return (
    <div className="grid gap-4">
      <p className="admin-muted">{t('intro')}</p>
      {EDITABLE_LISTS.map((list) => (
        <ListCard key={list} list={list} onNotice={onNotice} />
      ))}
    </div>
  );
}
