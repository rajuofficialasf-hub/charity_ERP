import { MEDIA_PRIORITIES, type MediaPriority } from '@css/shared/media';
import { Alert, Button, Modal, RadioGroup, Text, TextArea } from '@css/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { referToMedia } from '../../features/media/media-api';
import { ApiFailure } from '../../lib/api';

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
  const [priority, setPriority] = useState<MediaPriority>('normal');
  const [note, setNote] = useState('');
  const [story, setStory] = useState('');
  const send = useMutation({
    mutationFn: () =>
      referToMedia(applicationId, {
        priority,
        note: note.trim(),
        ...(story.trim() ? { story: story.trim() } : {}),
      }),
    onSuccess: onDone,
  });
  const failure =
    send.error instanceof ApiFailure
      ? send.error.message
      : send.error
        ? tc('state.error.text')
        : null;
  return (
    <Modal
      title={t('title')}
      isOpen
      onClose={onClose}
      dismissible={!send.isPending}
      secondaryAction={
        <Button variant="secondary" onPress={onClose} disabled={send.isPending}>
          {tc('action.cancel')}
        </Button>
      }
      primaryAction={
        <Button onPress={() => send.mutate()} disabled={!note.trim()} loading={send.isPending}>
          {resend ? t('resend') : t('send')}
        </Button>
      }
    >
      <Text tone="muted">{t('intro')}</Text>
      {failure ? (
        <Alert tone="danger" live="alert">
          {failure}
        </Alert>
      ) : null}
      <RadioGroup
        label={t('priority')}
        orientation="horizontal"
        options={MEDIA_PRIORITIES.map((p) => ({ id: p, label: tm(`priority.${p}`) }))}
        value={priority}
        onChange={(id) => setPriority(id as MediaPriority)}
      />
      <TextArea
        label={t('note')}
        helper={t('note_hint')}
        required
        maxLength={2000}
        value={note}
        onChange={setNote}
      />
      <TextArea
        label={t('story')}
        helper={t('story_hint')}
        maxLength={10000}
        value={story}
        onChange={setStory}
      />
    </Modal>
  );
}
