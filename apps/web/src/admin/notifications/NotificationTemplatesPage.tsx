/* eslint-disable security/detect-object-injection -- keys are typed languages, channels and statuses */
import { type EditableChannel, type TemplateEdit, templateEditSchema } from '@css/shared';
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
  Form,
  FormTextField,
  IconButton,
  Page,
  RadioGroup,
  Stack,
} from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { useAuth } from '../../lib/auth';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import { ForbiddenContent } from '../AdminLayout';
import { canAdministerSystem } from '../roles';
import {
  type NotificationTemplate,
  notificationTemplates,
  previewTemplate,
  saveTemplate,
  TEMPLATES_KEY,
} from './notifications-admin-api';
import { useTemplateName } from './template-name';
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
  const nameOf = useTemplateName();
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
      cell: (n) => nameOf(n.key),
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
        rowLabel={(n) => nameOf(n.key)}
        loading={list.isPending}
        error={
          list.error ? (
            <LoadError error={list.error} onRetry={() => void list.refetch()} />
          ) : undefined
        }
        emptyTitle={t('table')}
        rowActions={(n) => (
          <IconButton
            label={t('edit', { name: nameOf(n.key) })}
            icon="edit"
            onClick={() => edit(n)}
          />
        )}
        cardRenderer={(n) => (
          <div className="admin-permission-card">
            <strong>{nameOf(n.key)}</strong>
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
                name: nameOf(saved.key),
                version: formatCount(saved.channels[channel]?.version ?? 1, locale),
              }),
            );
          }}
        />
      )}
    </>
  );
}

function draftOf(template: NotificationTemplate, channel: EditableChannel): TemplateEdit {
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
  const name = useTemplateName()(template.key);
  const queryClient = useQueryClient();
  const available = Object.keys(template.channels) as EditableChannel[];
  const [channel, setChannel] = useState<EditableChannel>(available[0]!);
  // both languages of one channel as typed; the server's rules of a template text check them
  const form = useForm<TemplateEdit>({
    resolver: useSchemaResolver(templateEditSchema),
    defaultValues: draftOf(template, available[0]!),
    reValidateMode: 'onSubmit',
  });
  const refused = (failure: unknown) => showFailure(form, failure, tc('state.error.text'));
  const preview = useMutation({
    mutationFn: (draft: TemplateEdit) => previewTemplate(template.key, channel, draft),
    onError: refused,
  });
  const save = useMutation({
    mutationFn: (draft: TemplateEdit) => saveTemplate(template.key, channel, draft),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
      onSaved(saved, channel);
    },
    onError: refused,
  });
  const { reset: resetPreview } = preview;
  const { reset: resetSave } = save;
  const draft = useWatch({ control: form.control });
  // a change to the text makes the preview and the refusal out of date
  useEffect(() => {
    resetPreview();
    resetSave();
    form.clearErrors();
  }, [draft, form, resetPreview, resetSave]);
  const heading = channel === 'email' ? 'subject' : 'title';
  const switchTo = (next: string) => {
    const found = available.find((c) => c === next);
    if (!found) return;
    preview.reset();
    save.reset();
    setChannel(found);
    form.reset(draftOf(template, found));
  };
  // each button sends what it names, and nothing twice while it is on its way
  const showPreview = form.handleSubmit((draft) => {
    if (!preview.isPending) preview.mutate(draft);
  });
  const send = (draft: TemplateEdit) => {
    if (!save.isPending) save.mutate(draft);
  };

  return (
    <Dialog
      title={t('editor_title', { name })}
      size="large"
      fullScreenOnPhone
      open
      onClose={onClose}
      dismissible={!save.isPending}
      actions={
        <>
          <Button
            variant="secondary"
            loading={preview.isPending}
            onClick={() => void showPreview()}
          >
            {t('preview')}
          </Button>
          <Button loading={save.isPending} onClick={() => void form.handleSubmit(send)()}>
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
      <Form
        form={form}
        onSubmit={send}
        label={t('editor_title', { name })}
        error={form.formState.errors.root?.server?.message}
      >
        {LOCALES.map((l) => (
          <fieldset key={`${channel}-${l}`} className="admin-template-language">
            <legend className="admin-legend">{t(`language.${l}`)}</legend>
            <FormTextField
              name={`${l}.${heading}`}
              label={t(heading === 'subject' ? 'subject' : 'heading')}
              lang={l}
              maxLength={200}
            />
            <FormTextField
              name={`${l}.body`}
              label={t('body')}
              lang={l}
              maxLength={2000}
              rows={3}
            />
          </fieldset>
        ))}
      </Form>
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
    </Dialog>
  );
}
