import { formatDate } from '@css/shared/format';
import { CONTENT_TYPES, type ContentType, workUpdateSchema } from '@css/shared/media';
import {
  Alert,
  Button,
  Card,
  Chip,
  DescriptionList,
  Dialog,
  Form,
  FormSelectField,
  FormTextField,
  SelectField,
  Stack,
  Text,
} from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { DialogButtons } from '../../components/DialogButtons';
import { useSchemaResolver } from '../../lib/form-schema';
import { CommentDialog } from './CommentDialog';
import { type MediaReferral, type MediaWork, reviewWork, updateWork } from './media-api';
import { useMediaLabels } from './use-media-lists';
import { failureOf } from './work-errors';

/** The stage to move to, one of those the rules leave the caller. */
const STAGE_SCHEMA = z.object({ stage: z.string().min(1) });
type StageFields = z.infer<typeof STAGE_SCHEMA>;

/** The work's new name, by the rule of a change of the work: written, at most 200 characters. */
const RENAME_SCHEMA = z.object({ title: workUpdateSchema.shape.title.unwrap() });
type RenameFields = z.infer<typeof RENAME_SCHEMA>;

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
  const [renaming, setRenaming] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const texts = { stale: t('work.stale'), fallback: tc('state.error.text') };
  const stageForm = useForm<StageFields>({
    resolver: useSchemaResolver(STAGE_SCHEMA),
    defaultValues: { stage: '' },
    reValidateMode: 'onSubmit',
  });
  const stageChosen = useWatch({ control: stageForm.control, name: 'stage' }) !== '';
  const change = useMutation({
    mutationFn: (body: Parameters<typeof updateWork>[2]) => updateWork(work.id, work.version, body),
    onSuccess: (next, body) => {
      stageForm.reset();
      setRenaming(false);
      onSaved(next, body.stageCode ? t('work.stage_changed') : t('work.saved'));
    },
    onError: (error) => {
      if (failureOf(error, texts).stale) onStale();
    },
  });
  const review = useMutation({
    mutationFn: (body: { decision: 'approve' | 'send_back'; comment?: string }) =>
      reviewWork(work.id, work.version, body),
    onSuccess: (next, body) => {
      setSendingBack(false);
      onSaved(
        next,
        body.decision === 'approve' ? t('work.review_done') : t('work.review_sent_back_done'),
      );
    },
    onError: (error) => {
      if (failureOf(error, texts).stale) onStale();
    },
  });
  // a refused stage move shows on its own form; the card says what else was refused
  const stageFailure = change.variables?.stageCode ? change.error : null;
  const failure = (stageFailure ? null : change.error) ?? review.error;
  // the button's own path: a stage chosen, and nothing twice while a change is on its way
  const moveStage = ({ stage }: StageFields) => {
    if (stage === '' || change.isPending) return;
    review.reset();
    change.mutate({ stageCode: stage });
  };
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
              onChange={(id) => {
                if (!id || id === work.contentType) return;
                review.reset();
                change.mutate({ contentType: id as ContentType });
              }}
            />
          ) : null}
          {work.nextStages.length ? (
            <Form
              form={stageForm}
              onSubmit={moveStage}
              label={t('work.change_stage')}
              error={stageFailure ? failureOf(stageFailure, texts).text : undefined}
            >
              <Stack direction="row" gap={2} wrap align="end">
                <FormSelectField
                  name="stage"
                  label={t('work.stage_label')}
                  options={work.nextStages.map((s) => ({ value: s, label: labels.stage(s) }))}
                />
                <Button
                  type="submit"
                  disabled={!stageChosen}
                  loading={change.isPending && !renaming}
                >
                  {t('work.change_stage')}
                </Button>
              </Stack>
            </Form>
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
                  review.mutate({ decision: 'approve' });
                }}
                loading={review.isPending}
              >
                {t('work.review_approve')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  review.reset();
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
        <RenameDialog
          current={work.title}
          pending={change.isPending}
          error={change.error ? failureOf(change.error, texts).text : undefined}
          onSave={(title) => change.mutate({ title })}
          onClose={() => setRenaming(false)}
        />
      ) : null}
      {sendingBack ? (
        <CommentDialog
          title={t('work.review_send_back_title')}
          label={t('decision.comment')}
          confirmLabel={t('work.review_send_back')}
          pending={review.isPending}
          error={review.error ? failureOf(review.error, texts).text : undefined}
          onConfirm={(comment) => review.mutate({ decision: 'send_back', comment })}
          onClose={() => setSendingBack(false)}
        />
      ) : null}
    </>
  );
}

/** Renames the work: the new name trimmed, sent only when it differs from the current one. */
function RenameDialog({
  current,
  pending,
  error,
  onSave,
  onClose,
}: {
  current: string;
  pending: boolean;
  /** The refusal of the last attempt, in the reader's words. */
  error?: string;
  onSave: (title: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('media.work');
  const tc = useTranslations('common.action');
  const form = useForm<RenameFields>({
    resolver: useSchemaResolver(RENAME_SCHEMA),
    defaultValues: { title: current },
    reValidateMode: 'onSubmit',
  });
  const values = useWatch({ control: form.control });
  const ready = RENAME_SCHEMA.safeParse(values).success && values.title?.trim() !== current;
  // the button's own path: a new name, and nothing twice while the change is on its way
  const send = ({ title }: RenameFields) => {
    if (ready && !pending) onSave(title.trim());
  };
  return (
    <Dialog
      title={t('rename')}
      size="small"
      open
      onClose={onClose}
      dismissible={!pending}
      actions={
        <DialogButtons
          onCancel={onClose}
          onConfirm={() => void form.handleSubmit(send)()}
          confirmLabel={tc('save')}
          disabled={!ready}
          pending={pending}
        />
      }
    >
      <Form form={form} onSubmit={send} label={t('rename')} error={error}>
        <FormTextField name="title" label={t('title_label')} required maxLength={200} />
      </Form>
    </Dialog>
  );
}
