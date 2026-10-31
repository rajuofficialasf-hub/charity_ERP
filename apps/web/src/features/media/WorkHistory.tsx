import { formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Alert, Button, Card, Stack, Text, TextArea, Timeline, type TimelineStep } from '@css/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
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
  const [body, setBody] = useState('');
  const add = useMutation({
    mutationFn: () => commentOnWork(work.id, body.trim()),
    onSuccess: (next) => {
      setBody('');
      onSaved(next, t('saved'));
    },
  });
  return (
    <Card title={t('comments')} headingLevel={2}>
      <Stack gap={3}>
        {work.comments.length ? (
          <Stack gap={2} as="ul" role="list" className="media-link-cards">
            {work.comments.map((c) => (
              <li key={c.id}>
                <Text as="small" tone="muted">
                  {c.author.name} · {formatDateTime(c.at, locale)}
                </Text>
                <Text>{c.body}</Text>
              </li>
            ))}
          </Stack>
        ) : (
          <Text tone="muted">{t('no_comments')}</Text>
        )}
        {add.error ? (
          <Alert tone="danger" live="alert">
            {failureOf(add.error, { stale: t('stale'), fallback: tc('state.error.text') }).text}
          </Alert>
        ) : null}
        <TextArea label={t('new_comment')} maxLength={4000} value={body} onChange={setBody} />
        <Button
          variant="secondary"
          onPress={() => add.mutate()}
          disabled={!body.trim()}
          loading={add.isPending}
        >
          {t('add_comment')}
        </Button>
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
