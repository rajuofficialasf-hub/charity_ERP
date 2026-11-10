import { formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { commentSchema } from '@css/shared/media';
import { Button, Card, Form, FormTextField, Stack, Text, Timeline, type TimelineStep } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import type { z } from 'zod';
import { useSchemaResolver } from '../../lib/form-schema';
import { commentOnWork, type MediaEvent, type MediaReferral, type MediaWork } from './media-api';
import { useMediaLabels } from './use-media-lists';
import { failureOf } from './work-errors';

/** The kinds of history whose text names the stage reached. */
const KINDS = new Set([
  'referred',
  'resent',
  'accepted',
  'sent_back',
  'rejected',
  'title_changed',
  'stage_changed',
  'held',
  'resumed',
  'cancelled',
  'members_changed',
  'content_type_changed',
  'script_changed',
  'publication_added',
  'publication_changed',
  'review_approved',
  'review_sent_back',
]);

/** The work's comments, open to everyone who reads it, and a new comment. */
export function WorkComments({
  work,
  onSaved,
}: {
  work: MediaWork;
  onSaved: (next: MediaReferral, text: string) => void;
}) {
  const t = useTranslations('media.work');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const form = useForm<z.infer<typeof commentSchema>>({
    resolver: useSchemaResolver(commentSchema),
    defaultValues: { body: '' },
    reValidateMode: 'onSubmit',
  });
  const ready = commentSchema.safeParse(useWatch({ control: form.control })).success;
  const add = useMutation({
    mutationFn: (body: string) => commentOnWork(work.id, body),
    onSuccess: (next) => {
      form.reset();
      onSaved(next, t('saved'));
    },
  });
  // the button's own path: nothing it would refuse, and nothing twice while one is on its way
  const send = ({ body }: z.infer<typeof commentSchema>) => {
    if (ready && !add.isPending) add.mutate(body.trim());
  };
  return (
    <Card title={t('comments')} headingLevel={2}>
      <Stack gap={3}>
        {work.comments.length ? (
          <ul className="media-link-cards">
            {work.comments.map((c) => (
              <li key={c.id}>
                <Text size="small" tone="muted">
                  {c.author.name} · {formatDateTime(c.at, locale)}
                </Text>
                <Text>{c.body}</Text>
              </li>
            ))}
          </ul>
        ) : (
          <Text tone="muted">{t('no_comments')}</Text>
        )}
        <Form
          form={form}
          onSubmit={send}
          label={t('new_comment')}
          error={
            add.error
              ? failureOf(add.error, { stale: t('stale'), fallback: tc('state.error.text') }).text
              : undefined
          }
        >
          <FormTextField name="body" rows={4} label={t('new_comment')} maxLength={4000} />
          <Button type="submit" variant="secondary" disabled={!ready} loading={add.isPending}>
            {t('add_comment')}
          </Button>
        </Form>
      </Stack>
    </Card>
  );
}

/** Every step of the referral and its work, with who and when. */
export function WorkHistory({ history }: { history: MediaEvent[] }) {
  const t = useTranslations('media');
  const locale = useLocale() as Locale;
  const labels = useMediaLabels();
  const steps: TimelineStep[] = history.map((e, i) => ({
    id: e.id,
    title: KINDS.has(e.kind)
      ? t(`event.${e.kind as 'referred'}`, { to: e.toValue ? labels.stage(e.toValue) : '' })
      : e.kind,
    actor: e.actor.name,
    time: formatDateTime(e.at, locale),
    comment: e.comment ?? undefined,
    status: i === history.length - 1 ? 'current' : 'done',
  }));
  return (
    <Card title={t('work.history')} headingLevel={2}>
      <Timeline steps={steps} showActor label={t('work.history')} />
    </Card>
  );
}
