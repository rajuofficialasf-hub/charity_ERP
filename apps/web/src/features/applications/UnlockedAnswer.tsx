import { type AnswerValue, answerValueSchema } from '@css/shared';
import type { Locale } from '@css/shared/i18n';
import type { FormField } from '@css/shared/forms';
import { Alert, Button, Stack, Text } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { ApiFailure } from '../../api/client';
import { FieldInput } from '../forms/FieldInput';
import { answerText } from './AnswerList';
import type { Unlock } from './applications-api';
import { QuestionTitle } from '../forms/QuestionTitle';

/** A stored value read as an answer value, or nothing when it is empty or not one. */
export function valueOf(value: unknown): AnswerValue | undefined {
  const parsed = answerValueSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** An answer value as text in the reader's language, or the empty mark. */
export function AnswerValueText({ field, value }: { field: FormField; value: unknown }) {
  const t = useTranslations('applications.unlock');
  const tr = useTranslations('forms.renderer');
  const locale = useLocale() as Locale;
  const parsed = valueOf(value);
  const text = parsed ? answerText(field, parsed, locale, tr('yes'), tr('no')) : null;
  return <>{text ?? t('empty')}</>;
}

/**
 * One answer opened for correction, as the person who gives the new value sees it: the previous
 * answer, the question drawn as in the form with that answer to start from, and "পাঠান"; once
 * sent, the new answer waiting for the office's verification. The screen that owns the record
 * says how the value travels (through the outbox for a volunteer).
 */
export function UnlockedAnswer({
  unlock,
  field,
  fill,
  onSent,
}: {
  unlock: Unlock;
  field: FormField;
  /** Sends the new value; a refusal throws with its reason. */
  fill: (value: AnswerValue | null) => Promise<unknown>;
  onSent: () => Promise<unknown> | void;
}) {
  const t = useTranslations('applications.unlock');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const old = valueOf(unlock.oldValue);
  const [value, setValue] = useState<AnswerValue | null>(old ?? null);
  const send = useMutation({
    mutationFn: () => fill(value),
    onSuccess: async () => {
      await onSent();
    },
  });
  const failure =
    send.error instanceof ApiFailure
      ? (send.error.details[0]?.message ?? send.error.message)
      : send.error instanceof Error
        ? send.error.message
        : send.error
          ? tc('state.error.text')
          : undefined;
  const unchanged = JSON.stringify(value) === JSON.stringify(old ?? null);
  return (
    <section aria-labelledby={`unlock-${unlock.id}`}>
      <Stack gap={2}>
        <strong id={`unlock-${unlock.id}`}>{field.label[locale]}</strong>
        <Text tone="muted">
          {t('old')}: <AnswerValueText field={field} value={unlock.oldValue} />
        </Text>
        {unlock.state === 'updated' ? (
          <>
            <Text>
              {t('new')}: <AnswerValueText field={field} value={unlock.newValue} />
            </Text>
            <Alert tone="info">{t('waiting')}</Alert>
          </>
        ) : unlock.mayFill ? (
          <>
            <QuestionTitle>{t('give_new')}</QuestionTitle>
            <FieldInput
              field={field}
              id={`unlock-value-${unlock.id}`}
              state={{ visible: true, required: field.required, options: field.options ?? [] }}
              value={value ?? undefined}
              computed={undefined}
              error={failure}
              onChange={setValue}
              nisabKnown
            />
            <div>
              <Button
                variant="primary"
                size="small"
                disabled={value === null || unchanged}
                loading={send.isPending}
                onClick={() => send.mutate()}
              >
                {t('send')}
              </Button>
            </div>
          </>
        ) : (
          <Text tone="muted">{t('waiting_answer')}</Text>
        )}
      </Stack>
    </section>
  );
}
