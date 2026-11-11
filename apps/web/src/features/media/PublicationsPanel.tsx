import { isoDateInDhaka } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { PUBLICATION_STATES, type PublicationState } from '@css/shared/media';
import {
  Alert,
  Button,
  Card,
  Chip,
  Dialog,
  Form,
  FormDateField,
  FormSelectField,
  FormTextField,
  Stack,
  Text,
} from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import { useSchemaResolver } from '../../lib/form-schema';
import {
  addPublication,
  type MediaPublication,
  type MediaReferral,
  type MediaWork,
  updatePublication,
} from './media-api';
import { useMediaLabels } from './use-media-lists';
import { WorkLinkCard } from './WorkLinkCard';
import { failureOf } from './work-errors';
import { DialogButtons } from '../../components/DialogButtons';

const STATE_TONE: Record<PublicationState, 'neutral' | 'success' | 'warning'> = {
  waiting: 'neutral',
  published: 'success',
  taken_down: 'warning',
};

/** A publication as typed: a platform, and for a published post its link and its date. */
const PUBLICATION_SCHEMA = z
  .object({
    platform: z.string(),
    state: z.enum(PUBLICATION_STATES),
    date: z.string(),
    link: z.string(),
    note: z.string(),
  })
  .superRefine((v, ctx) => {
    const required = (path: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message: 'validation.required' });
    if (!v.platform) required('platform');
    if (v.state === 'published' && !v.link.trim()) required('link');
    if (v.state === 'published' && !v.date) required('date');
  });
type PublicationFields = z.infer<typeof PUBLICATION_SCHEMA>;

/**
 * Where a work was published: a card per platform with its state, and for whoever runs the work a
 * publication added or changed in a dialog. A post is marked published only after the final
 * review; the first one makes the work "published" by itself.
 */
export function PublicationsPanel({
  work,
  onSaved,
}: {
  work: MediaWork;
  onSaved: (next: MediaReferral, text: string) => void;
}) {
  const t = useTranslations('media');
  const labels = useMediaLabels();
  const [editing, setEditing] = useState<{ publication?: MediaPublication } | null>(null);
  return (
    <Card
      title={t('work.publications')}
      headingLevel={2}
      action={
        work.mayManage ? (
          <Button variant="secondary" size="small" onClick={() => setEditing({})}>
            {t('work.add_publication')}
          </Button>
        ) : null
      }
    >
      <Stack gap={2}>
        {work.publications.length ? (
          <ul className="media-link-cards">
            {work.publications.map((p) => (
              <li key={p.id}>
                <WorkLinkCard
                  title={labels.platform(p.platformCode)}
                  platformCode={p.platformCode}
                  link={p.link}
                  publishedOn={p.publishedOn}
                  youtubeId={p.youtubeId}
                >
                  <Stack direction="row" gap={2} wrap align="center">
                    <Chip tone={STATE_TONE[p.state]}>{t(`publication_state.${p.state}`)}</Chip>
                    {work.mayManage ? (
                      <Button
                        variant="text"
                        size="small"
                        onClick={() => setEditing({ publication: p })}
                      >
                        {t('work.edit_publication', { platform: labels.platform(p.platformCode) })}
                      </Button>
                    ) : null}
                  </Stack>
                  {p.note ? <Text size="small">{p.note}</Text> : null}
                </WorkLinkCard>
              </li>
            ))}
          </ul>
        ) : (
          <Text tone="muted">{t('work.no_publications')}</Text>
        )}
        <Text size="small" tone="muted">
          {t('work.files_note')}
        </Text>
      </Stack>
      {editing ? (
        <PublicationDialog
          work={work}
          publication={editing.publication}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            setEditing(null);
            onSaved(next, t('work.publication_saved'));
          }}
        />
      ) : null}
    </Card>
  );
}

function PublicationDialog({
  work,
  publication,
  onClose,
  onSaved,
}: {
  work: MediaWork;
  publication?: MediaPublication;
  onClose: () => void;
  onSaved: (next: MediaReferral) => void;
}) {
  const t = useTranslations('media');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const labels = useMediaLabels();
  const form = useForm<PublicationFields>({
    resolver: useSchemaResolver(PUBLICATION_SCHEMA),
    defaultValues: {
      platform: publication?.platformCode ?? '',
      state: publication?.state ?? 'waiting',
      date: publication?.publishedOn ?? isoDateInDhaka(new Date()),
      link: publication?.link ?? '',
      note: publication?.note ?? '',
    },
    reValidateMode: 'onSubmit',
  });
  const values = useWatch({ control: form.control });
  const save = useMutation({
    mutationFn: ({ platform, state, date, link, note }: PublicationFields) => {
      const given = {
        state,
        ...(date && (state !== 'waiting' || link.trim()) ? { publishedOn: date } : {}),
        ...(link.trim() ? { link: link.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      // an emptied link or note of a stored publication is cleared, not kept
      return publication
        ? updatePublication(publication.id, {
            ...given,
            ...(!link.trim() && publication.link ? { link: null } : {}),
            ...(!note.trim() && publication.note ? { note: null } : {}),
          })
        : addPublication(work.id, { platformCode: platform, ...given });
    },
    onSuccess: onSaved,
  });
  const failure = save.error
    ? failureOf(save.error, { stale: t('work.stale'), fallback: tc('state.error.text') }).text
    : undefined;
  const needsLink = values.state === 'published';
  const ready = PUBLICATION_SCHEMA.safeParse(values).success;
  const platforms = labels.platforms.filter((p) => p.active || p.code === values.platform);
  // the button's own path: nothing it would refuse, and nothing twice while a save is on its way
  const send = (fields: PublicationFields) => {
    if (ready && !save.isPending) save.mutate(fields);
  };
  const title = publication
    ? t('work.edit_publication', { platform: labels.platform(publication.platformCode) })
    : t('work.add_publication');
  return (
    <Dialog
      title={title}
      open
      onClose={onClose}
      dismissible={!save.isPending}
      actions={
        <DialogButtons
          onCancel={onClose}
          onConfirm={() => void form.handleSubmit(send)()}
          confirmLabel={tc('action.save')}
          disabled={!ready}
          pending={save.isPending}
        />
      }
    >
      <Form form={form} onSubmit={send} label={title} error={failure}>
        {needsLink && !work.reviewApprovedBy ? (
          <Alert tone="warning">{t('work.review_hint')}</Alert>
        ) : null}
        <FormSelectField
          name="platform"
          label={t('work.platform')}
          required
          disabled={!!publication}
          options={platforms.map((p) => ({ value: p.code, label: localized(p.label, locale) }))}
        />
        <FormSelectField
          name="state"
          label={t('work.publication_state')}
          required
          options={PUBLICATION_STATES.map((s) => ({
            value: s,
            label: t(`publication_state.${s}`),
          }))}
        />
        <FormTextField
          name="link"
          label={t('work.link')}
          hint={t('work.link_hint')}
          required={needsLink}
          lang="en"
          maxLength={500}
        />
        <FormDateField name="date" label={t('work.published_on')} required={needsLink} />
        <FormTextField name="note" rows={4} label={t('work.publication_note')} maxLength={2000} />
      </Form>
    </Dialog>
  );
}
