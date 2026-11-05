import type { Locale } from '@css/shared/i18n';
import type { FormDefinition, FormField } from '@css/shared/forms';
import { Alert, Button, Card, Chip, DescriptionList, Stack, Text } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { fillUnlock, type Unlock } from '../../features/applications/applications-api';
import { AnswerValueText, UnlockedAnswer } from '../../features/applications/UnlockedAnswer';
import { ApiFailure } from '../../lib/api';
import { cancelUnlock, decideUnlock } from './applications-api';
import { DecisionDialog } from './DecisionDialog';

/** The question of an answer, whichever section holds it. */
export const fieldOf = (form: FormDefinition, fieldKey: string): FormField | undefined =>
  form.sections.flatMap((s) => s.fields).find((f) => f.fieldKey === fieldKey);

type Step = { unlock: Unlock; kind: 'refuse' | 'cancel' };

/**
 * The answers of an application open for correction, as the office sees them: why each was
 * opened, the previous and the new answer, and the steps the reader may take: accept or send back
 * a new answer (never the one who gave it), cancel the unlock, or give the answer when the office
 * fills it (no volunteer, or the official section).
 */
export function UnlockReview({
  form,
  unlocks,
  meId,
  onChanged,
}: {
  form: FormDefinition;
  unlocks: Unlock[];
  meId: string;
  onChanged: (notice: string) => Promise<unknown>;
}) {
  const t = useTranslations('applications.unlock');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const [step, setStep] = useState<Step | null>(null);
  const failure = (error: unknown) =>
    error instanceof ApiFailure ? error.message : tc('state.error.text');
  const accept = useMutation({
    mutationFn: (unlock: Unlock) => decideUnlock(unlock.id, 'accept'),
    onSuccess: () => onChanged(t('accepted')),
  });
  const ended = useMutation({
    mutationFn: ({ unlock, kind, reason }: Step & { reason: string }) =>
      kind === 'refuse'
        ? decideUnlock(unlock.id, 'refuse', reason)
        : cancelUnlock(unlock.id, reason),
    onSuccess: async (_, { kind }) => {
      setStep(null);
      await onChanged(t(kind === 'refuse' ? 'refused' : 'cancelled'));
    },
  });
  return (
    <Card title={t('office_title')} headingLevel={2}>
      <Stack gap={3}>
        {accept.error ? <Alert tone="error">{failure(accept.error)}</Alert> : null}
        {unlocks.map((unlock) => {
          const field = fieldOf(form, unlock.fieldKey);
          if (!field) return null;
          return (
            <div key={unlock.id} className="admin-unlock">
              {unlock.mayFill ? (
                <UnlockedAnswer
                  unlock={unlock}
                  field={field}
                  fill={(value) => fillUnlock(unlock.id, value)}
                  onSent={() => onChanged(t('sent'))}
                />
              ) : (
                <>
                  <strong>{field.label[locale]}</strong>
                  <DescriptionList
                    items={[
                      { label: t('reason'), value: unlock.reason ?? '' },
                      {
                        label: t('old'),
                        value: <AnswerValueText field={field} value={unlock.oldValue} />,
                      },
                      ...(unlock.state === 'updated'
                        ? [
                            {
                              label: t('new'),
                              value: <AnswerValueText field={field} value={unlock.newValue} />,
                            },
                          ]
                        : []),
                    ]}
                  />
                </>
              )}
              <Stack direction="row" gap={2} wrap>
                <Chip tone={unlock.state === 'updated' ? 'warning' : 'info'}>
                  {t(unlock.state === 'updated' ? 'waiting' : 'waiting_answer')}
                </Chip>
                {unlock.mayDecide ? (
                  <>
                    <Button
                      variant="primary"
                      size="small"
                      loading={accept.isPending && accept.variables?.id === unlock.id}
                      onClick={() => accept.mutate(unlock)}
                    >
                      {t('accept')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => setStep({ unlock, kind: 'refuse' })}
                    >
                      {t('refuse')}
                    </Button>
                  </>
                ) : null}
                {unlock.mayCancel ? (
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => setStep({ unlock, kind: 'cancel' })}
                  >
                    {t('cancel')}
                  </Button>
                ) : null}
              </Stack>
              {unlock.state === 'updated' && unlock.enteredBy === meId ? (
                <Text tone="muted">{t('own_entry')}</Text>
              ) : unlock.state === 'open' && !unlock.mayFill ? (
                <Text tone="muted">{t('volunteer_fills')}</Text>
              ) : null}
            </div>
          );
        })}
      </Stack>
      {step ? (
        <DecisionDialog
          title={t(step.kind === 'refuse' ? 'refuse_title' : 'cancel_title')}
          confirm={t(step.kind === 'refuse' ? 'refuse' : 'cancel')}
          danger
          pending={ended.isPending}
          error={ended.error ? failure(ended.error) : null}
          onConfirm={({ reason }) => ended.mutate({ ...step, reason: reason ?? '' })}
          onClose={() => {
            ended.reset();
            setStep(null);
          }}
        />
      ) : null}
    </Card>
  );
}
