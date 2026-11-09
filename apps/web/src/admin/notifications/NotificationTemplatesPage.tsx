/* eslint-disable security/detect-object-injection -- keys are typed languages, channels and statuses */
import type { EditableChannel, TemplateEdit } from '@css/shared';
import { formatCount } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Alert,
  Button,
  Card,
  Chip,
  DataTable,
  type DataTableExtendedColumn,
  Dialog,
  IconButton,
  Page,
  RadioGroup,
  Stack,
  TextField,
} from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../api/client';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canAdministerSystem } from '../roles';
import {
  type NotificationTemplate,
  notificationTemplates,
  previewTemplate,
  saveTemplate,
  TEMPLATES_KEY,
} from './notifications-admin-api';
import { LoadError } from '../../components/LoadError';

const LOCALES = ['bn', 'en'] as const;

/**
 * The notification texts for the Department Head and the Monitoring Team (docs/architecture/
 * NOTIFICATIONS.md, templates): every notification with its channels; one channel is edited in both
 * languages at once, previewed with sample values, and saved as a new version, so what was
 * already written keeps its text. The server refuses a value the notification does not have.
 */
export function NotificationTemplatesPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.notification_templates');
  const locale = useLocale() as Locale;
  const [editing, setEditing] = useState<NotificationTemplate | null>(null);
  const [notice, setNotice] = useState<string>();
  const allowed = Boolean(me && canAdministerSystem(me));
  const list = useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: notificationTemplates,
    enabled: allowed,
  });
  if (!me) return null;
  if (!allowed) return <ForbiddenContent />;

  const channels = (n: NotificationTemplate) => (
    <Stack direction="row" wrap gap={2}>
      {(Object.keys(n.channels) as EditableChannel[]).map((c) => (
        <Chip key={c}>
          {t('version', {
            channel: t(`channel.${c}`),
            version: formatCount(n.channels[c]!.version, locale),
          })}
        </Chip>
      ))}
    </Stack>
  );
  const columns: DataTableExtendedColumn<NotificationTemplate>[] = [
    {
      id: 'key',
      header: t('column.key'),
      cell: (n) => <code lang="en">{n.key}</code>,
      isRowHeader: true,
    },
    { id: 'category', header: t('column.category'), cell: (n) => t(`category.${n.category}`) },
    { id: 'channels', header: t('column.channels'), cell: channels, priority: 2 },
  ];
  const edit = (n: NotificationTemplate) => {
    setNotice(undefined);
    setEditing(n);
  };

  return (
    <>
      <DocumentTitle title={t('title')} />
      <Page
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('intro')}
        documentTitle={false}
      />
      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Alert>
      )}
      <DataTable
        label={t('table')}
        columns={columns}
        rows={list.data ?? []}
        getRowId={(n) => n.key}
        rowLabel={(n) => n.key}
        loading={list.isPending}
        error={
          list.error ? (
            <LoadError error={list.error} onRetry={() => void list.refetch()} />
          ) : undefined
        }
        emptyTitle={t('table')}
        rowActions={(n) => (
          <IconButton label={t('edit', { key: n.key })} icon="edit" onClick={() => edit(n)} />
        )}
        cardRenderer={(n) => (
          <div className="admin-permission-card">
            <code lang="en">{n.key}</code>
            <span>{t(`category.${n.category}`)}</span>
            {channels(n)}
          </div>
        )}
      />
      {editing && (
        <TemplateEditor
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, channel) => {
            setEditing(null);
            setNotice(
              t('saved', {
                key: saved.key,
                version: formatCount(saved.channels[channel]?.version ?? 1, locale),
              }),
            );
          }}
        />
      )}
    </>
  );
}

type Draft = TemplateEdit;

function draftOf(template: NotificationTemplate, channel: EditableChannel): Draft {
  const stored = template.channels[channel]!;
  const text = (l: 'bn' | 'en') => ({
    ...(channel === 'email'
      ? { subject: stored[l].subject ?? '' }
      : { title: stored[l].title ?? '' }),
    body: stored[l].body,
  });
  return { bn: text('bn'), en: text('en') };
}

function TemplateEditor({
  template,
  onClose,
  onSaved,
}: {
  template: NotificationTemplate;
  onClose: () => void;
  onSaved: (saved: NotificationTemplate, channel: EditableChannel) => void;
}) {
  const t = useTranslations('admin.notification_templates');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const available = Object.keys(template.channels) as EditableChannel[];
  const [channel, setChannel] = useState<EditableChannel>(available[0]!);
  const [draft, setDraft] = useState<Draft>(() => draftOf(template, available[0]!));
  const preview = useMutation({ mutationFn: () => previewTemplate(template.key, channel, draft) });
  const save = useMutation({
    mutationFn: () => saveTemplate(template.key, channel, draft),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
      onSaved(saved, channel);
    },
  });
  const failure =
    save.error instanceof ApiFailure
      ? save.error
      : preview.error instanceof ApiFailure
        ? preview.error
        : null;
  const errorAt = (path: string) => failure?.details.find((d) => d.path === path)?.message;
  const heading = channel === 'email' ? 'subject' : 'title';
  const change = (l: 'bn' | 'en', field: 'subject' | 'title' | 'body', value: string) => {
    preview.reset();
    save.reset();
    setDraft((d) => ({ ...d, [l]: { ...d[l], [field]: value } }));
  };
  const switchTo = (next: string) => {
    const found = available.find((c) => c === next);
    if (!found) return;
    preview.reset();
    save.reset();
    setChannel(found);
    setDraft(draftOf(template, found));
  };

  return (
    <Dialog
      title={t('editor_title', { key: template.key })}
      size="large"
      fullScreenOnPhone
      open
      onClose={onClose}
      dismissible={!save.isPending}
      actions={
        <>
          <Button variant="secondary" loading={preview.isPending} onClick={() => preview.mutate()}>
            {t('preview')}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {t('save')}
          </Button>
        </>
      }
    >
      {available.length > 1 && (
        <RadioGroup
          label={t('channel.label')}
          orientation="horizontal"
          options={available.map((c) => ({ value: c, label: t(`channel.${c}`) }))}
          value={channel}
          onChange={(c) => switchTo(c as typeof channel)}
        />
      )}
      <p className="admin-muted">
        {template.variables.length
          ? t('variables', { list: template.variables.map((v) => `{{${v}}}`).join(', ') })
          : t('variables_none')}
      </p>
      {failure && !failure.details.length && <Alert tone="error">{failure.message}</Alert>}
      {LOCALES.map((l) => (
        <fieldset key={l} className="admin-template-language">
          <legend className="admin-legend">{t(`language.${l}`)}</legend>
          <TextField
            label={t(heading === 'subject' ? 'subject' : 'heading')}
            lang={l}
            maxLength={200}
            value={draft[l][heading] ?? ''}
            onChange={(v) => change(l, heading, v)}
            error={errorAt(`${l}.${heading}`)}
          />
          <TextField
            label={t('body')}
            lang={l}
            maxLength={2000}
            rows={3}
            value={draft[l].body}
            onChange={(v) => change(l, 'body', v)}
            error={errorAt(`${l}.body`)}
          />
        </fieldset>
      ))}
      {preview.data && (
        <section aria-label={t('preview_title')} className="admin-template-preview">
          <h3>{t('preview_title')}</h3>
          {LOCALES.map((l) => {
            const r = preview.data[l];
            return (
              <Card key={l} title={r.subject ?? r.title ?? t(`language.${l}`)} headingLevel={3}>
                <p className="admin-pre-line" lang={l}>
                  {r.body}
                </p>
              </Card>
            );
          })}
        </section>
      )}
      {save.isError && !(save.error instanceof ApiFailure) && (
        <Alert tone="error">{tc('state.error.text')}</Alert>
      )}
    </Dialog>
  );
}
