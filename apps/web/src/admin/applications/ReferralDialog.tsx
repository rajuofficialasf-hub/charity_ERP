import { MEDIA_PRIORITIES, type MediaPriority, referralCreateSchema } from '@css/shared/media';
import { Button, Dialog, Form, FormTextField, RadioGroup, Text } from '@/ui';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { referToMedia } from '../../features/media/media-api';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';

/** The referral's request, with the story left empty when none is written. */
const REFERRAL_SCHEMA = referralCreateSchema.extend({ story: z.string().trim().max(10000) });
type ReferralFields = z.infer<typeof REFERRAL_SCHEMA>;

/**
 * Sends an approved application to the Media Team, or a returned referral again: a priority, a
 * note and an optional story the team reads beside the official's comment. The application's own
 * state does not change.
 */
export function ReferralDialog({
  applicationId,
  resend,
  onClose,
  onDone,
}: {
  applicationId: string;
  resend: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('media.referral');
  const tm = useTranslations('media');
  const tc = useTranslations('common');
  const form = useForm<ReferralFields>({
    resolver: useSchemaResolver(REFERRAL_SCHEMA),
    defaultValues: { priority: 'normal', note: '', story: '' },
    reValidateMode: 'onSubmit',
  });
  const ready = REFERRAL_SCHEMA.safeParse(useWatch({ control: form.control })).success;
  const pending = form.formState.isSubmitting;

  const send = async ({ priority, note, story }: ReferralFields) => {
    try {
      await referToMedia(applicationId, {
        priority,
        note: note.trim(),
        ...(story.trim() ? { story: story.trim() } : {}),
      });
    } catch (failure) {
      showFailure(form, failure, tc('state.error.text'));
      return;
    }
    onDone();
  };

  return (
    <Dialog
      title={t('title')}
      open
      onClose={onClose}
      dismissible={!pending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {tc('action.cancel')}
          </Button>
          <Button
            onClick={() => void form.handleSubmit(send)()}
            disabled={!ready}
            loading={pending}
          >
            {resend ? t('resend') : t('send')}
          </Button>
        </>
      }
    >
      <Form
        form={form}
        onSubmit={send}
        label={t('title')}
        error={form.formState.errors.root?.server?.message}
      >
        <Text tone="muted">{t('intro')}</Text>
        <Controller
          control={form.control}
          name="priority"
          render={({ field }) => (
            <RadioGroup
              label={t('priority')}
              orientation="horizontal"
              options={MEDIA_PRIORITIES.map((p) => ({ value: p, label: tm(`priority.${p}`) }))}
              value={field.value}
              onChange={(id) => field.onChange(id as MediaPriority)}
            />
          )}
        />
        <FormTextField
          name="note"
          rows={4}
          label={t('note')}
          hint={t('note_hint')}
          required
          maxLength={2000}
        />
        <FormTextField
          name="story"
          rows={4}
          label={t('story')}
          hint={t('story_hint')}
          maxLength={10000}
        />
      </Form>
    </Dialog>
  );
}
