import { formatDate } from '@css/shared/format';
import { CONTENT_TYPES, type ContentType } from '@css/shared/media';
import {
  Alert,
  Button,
  Card,
  Chip,
  DescriptionList,
  Dialog,
  SelectField,
  Stack,
  Text,
  TextField,
} from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { type MediaReferral, type MediaWork, reviewWork, updateWork } from './media-api';
import { useMediaLabels } from './use-media-lists';
import { failureOf } from './work-errors';
import { DialogButtons } from '../../components/DialogButtons';

/**
 * The work's stage, title and content type, and the final review: the stages offered are the ones
 * the rules leave the caller; a director renames; the Media Director approves or sends the work
 * back while it is ready to publish. Every change carries the version the caller read.
 */
export function StagePanel({
  work,
  onSaved,
  onStale,
}: {
  work: MediaWork;
  onSaved: (next: MediaReferral, text: string) => void;
  onStale: () => void;
}) {
  const t = useTranslations('media');
  const tc = useTranslations('common');
  const labels = useMediaLabels();
  const [stage, setStage] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(work.title);
  const [sendingBack, setSendingBack] = useState(false);
  const [comment, setComment] = useState('');
  const texts = { stale: t('work.stale'), fallback: tc('state.error.text') };
  const change = useMutation({
    mutationFn: (body: Parameters<typeof updateWork>[2]) => updateWork(work.id, work.version, body),
    onSuccess: (next, body) => {
      setStage(null);
      setRenaming(false);
      onSaved(next, body.stageCode ? t('work.stage_changed') : t('work.saved'));
    },
    onError: (error) => {
      if (failureOf(error, texts).stale) onStale();
    },
  });
  const review = useMutation({
    mutationFn: (decision: 'approve' | 'send_back') =>
      reviewWork(work.id, work.version, {
        decision,
        ...(decision === 'send_back' ? { comment: comment.trim() } : {}),
      }),
    onSuccess: (next) => {
      setSendingBack(false);
      setComment('');
      onSaved(next, t('work.saved'));
    },
    onError: (error) => {
      if (failureOf(error, texts).stale) onStale();
    },
  });
  const failure = change.error ?? review.error;
  const ready = work.stageCode === 'ready_to_publish';
  return (
    <>
      <Card
        title={t('work.stage')}
        headingLevel={2}
        action={
          work.mayDirect ? (
            <Button
              variant="text"
              size="small"
              onClick={() => {
                change.reset();
                setTitle(work.title);
                setRenaming(true);
              }}
            >
              {t('work.rename')}
            </Button>
          ) : null
        }
      >
        <Stack gap={3}>
          {failure && !renaming && !sendingBack ? (
            <Alert tone="error">{failureOf(failure, texts).text}</Alert>
          ) : null}
          <DescriptionList
            items={[
              {
                label: t('work.stage'),
                value: (
                  <Stack direction="row" gap={2} wrap>
                    <Chip tone="info">{labels.stage(work.stageCode)}</Chip>
                    {work.heldStageCode ? (
                      <Text size="small" tone="muted">
                        {t('work.held', { stage: labels.stage(work.heldStageCode) })}
                      </Text>
                    ) : null}
                  </Stack>
                ),
              },
              ...(work.mayManage
                ? []
                : [{ label: t('work.content_type'), value: t(`content.${work.contentType}`) }]),
            ]}
          />
          {work.mayManage ? (
            <SelectField
              label={t('work.content_type')}
              value={work.contentType}
              options={CONTENT_TYPES.map((c) => ({ value: c, label: t(`content.${c}`) }))}
              onChange={(id) =>
                id && id !== work.contentType
                  ? (review.reset(), change.mutate({ contentType: id as ContentType }))
                  : undefined
              }
            />
          ) : null}
          {work.nextStages.length ? (
            <Stack direction="row" gap={2} wrap align="end">
              <SelectField
                label={t('work.stage_label')}
                value={stage ?? ''}
                options={work.nextStages.map((s) => ({ value: s, label: labels.stage(s) }))}
                onChange={(v) => setStage(v || null)}
              />
              <Button
                onClick={() => {
                  if (!stage) return;
                  review.reset();
                  change.mutate({ stageCode: stage });
                }}
                disabled={!stage}
                loading={change.isPending && !renaming}
              >
                {t('work.change_stage')}
              </Button>
            </Stack>
          ) : null}
          {work.mayManage ? (
            <Text size="small" tone="muted">
              {t('work.stage_hint')}
            </Text>
          ) : null}
        </Stack>
      </Card>
      <Card title={t('work.review')} headingLevel={2}>
        <Stack gap={2}>
          {work.reviewApprovedBy && work.reviewApprovedAt ? (
            <Chip tone="success">
              {t('work.review_approved', {
                name: work.reviewApprovedBy.name,
                date: formatDate(work.reviewApprovedAt),
              })}
            </Chip>
          ) : (
            <Text size="small" tone="muted">
              {ready ? t('work.review_waiting') : t('work.review_not_ready')}
            </Text>
          )}
          <Text size="small" tone="muted">
            {t('work.review_hint')}
          </Text>
          {work.mayReview && !work.reviewApprovedBy ? (
            <Stack direction="row" gap={2} wrap>
              <Button
                onClick={() => {
                  change.reset();
                  review.mutate('approve');
                }}
                loading={review.isPending}
              >
                {t('work.review_approve')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  review.reset();
                  setComment('');
                  setSendingBack(true);
                }}
              >
                {t('work.review_send_back')}
              </Button>
            </Stack>
          ) : null}
        </Stack>
      </Card>
      {renaming ? (
        <Dialog
          title={t('work.rename')}
          size="small"
          open
          onClose={() => setRenaming(false)}
          dismissible={!change.isPending}
          actions={
            <DialogButtons
              onCancel={() => setRenaming(false)}
              onConfirm={() => change.mutate({ title: title.trim() })}
              confirmLabel={tc('action.save')}
              disabled={!title.trim() || title.trim() === work.title}
              pending={change.isPending}
            />
          }
        >
          {change.error ? <Alert tone="error">{failureOf(change.error, texts).text}</Alert> : null}
          <TextField
            label={t('work.title_label')}
            required
            maxLength={200}
            value={title}
            onChange={setTitle}
          />
        </Dialog>
      ) : null}
      {sendingBack ? (
        <Dialog
          title={t('work.review_send_back_title')}
          size="small"
          open
          onClose={() => setSendingBack(false)}
          dismissible={!review.isPending}
          actions={
            <DialogButtons
              onCancel={() => setSendingBack(false)}
              onConfirm={() => review.mutate('send_back')}
              confirmLabel={t('work.review_send_back')}
              disabled={!comment.trim()}
              pending={review.isPending}
            />
          }
        >
          {review.error ? <Alert tone="error">{failureOf(review.error, texts).text}</Alert> : null}
          <TextField
            rows={4}
            label={t('decision.comment')}
            required
            maxLength={2000}
            value={comment}
            onChange={setComment}
          />
        </Dialog>
      ) : null}
    </>
  );
}
