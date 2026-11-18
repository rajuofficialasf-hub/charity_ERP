import { formatCount, formatDateTime } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { Alert, Button, Card, Chip, RadioGroup, Stack, Text, TextField } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { ApiFailure } from '../../api/client';
import type { ReviewCheckItem } from '../../api/schemas/office-applications';
import { answerReviewCheck, type OfficeApplication } from './applications-api';

/**
 * The project's review checklist on the review page: each item answered "ঠিক আছে" with one press,
 * or "সমস্যা আছে" with a comment first, with who answered and when. It says how many items are
 * left and whether the project requires them all before sending for approval; the server refuses
 * a send that leaves a required item open. Read only where the caller may not review.
 */
export function ReviewChecklist({
  application: a,
  etag,
  editable,
  onAnswered,
}: {
  application: OfficeApplication;
  etag: string;
  editable: boolean;
  onAnswered: () => Promise<unknown>;
}) {
  const t = useTranslations('applications.office.checklist');
  const locale = useLocale() as Locale;
  const [problem, setProblem] = useState<{ code: string; comment: string } | null>(null);
  // a fine answer shows at once, and stays until the record read again holds it
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const answer = useMutation({
    mutationFn: (
      input: { code: string; result: 'ok' } | { code: string; result: 'problem'; comment: string },
    ) => {
      const { code, ...body } = input;
      return answerReviewCheck(a.id, etag, code, body);
    },
    onSuccess: async () => {
      setProblem(null);
      await onAnswered();
    },
    onError: (_error, input) =>
      setChosen((codes) => new Set([...codes].filter((code) => code !== input.code))),
  });
  const checklist = a.reviewChecklist;
  if (!checklist || !checklist.items.length) return null;
  const left = checklist.items.filter((item) => item.result === null).length;
  const failed =
    answer.error instanceof ApiFailure ? answer.error.message : answer.error ? t('failed') : null;
  const choose = (item: ReviewCheckItem, value: string) => {
    if (answer.isPending) return;
    if (value === 'ok') {
      setProblem(null);
      setChosen((codes) => new Set(codes).add(item.code));
      answer.mutate({ code: item.code, result: 'ok' });
    } else setProblem({ code: item.code, comment: item.comment ?? '' });
  };
  return (
    <Card title={t('title')} headingLevel={2}>
      <Stack gap={2}>
        <Text tone="muted">{checklist.required ? t('required') : t('optional')}</Text>
        <Text>{left ? t('left', { count: formatCount(left, locale) }) : t('done')}</Text>
        {failed ? <Alert tone="error">{failed}</Alert> : null}
        {checklist.items.map((item) => {
          const label = localized(item.label, locale);
          const asking = problem?.code === item.code;
          return (
            <Stack key={item.code} gap={1}>
              {editable ? (
                <RadioGroup
                  label={label}
                  orientation="horizontal"
                  value={
                    asking ? 'problem' : (item.result ?? (chosen.has(item.code) ? 'ok' : null))
                  }
                  onChange={(value) => choose(item, value)}
                  options={[
                    { value: 'ok', label: t('ok') },
                    { value: 'problem', label: t('problem') },
                  ]}
                />
              ) : (
                // read only: the answer as a mark beside the item, no choice to make
                <Stack direction="row" gap={1} wrap align="center">
                  <Text>{label}</Text>
                  <Chip
                    tone={
                      item.result === 'ok'
                        ? 'success'
                        : item.result === 'problem'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {item.result ? t(item.result) : t('unanswered')}
                  </Chip>
                </Stack>
              )}
              {item.comment && !asking ? <Text>{item.comment}</Text> : null}
              {item.checkedBy && item.checkedAt ? (
                <Text tone="muted" size="small">
                  {t('by', {
                    name: item.checkedBy.name,
                    time: formatDateTime(item.checkedAt, locale),
                  })}
                </Text>
              ) : null}
              {asking ? (
                <Stack direction="row" gap={1} wrap align="end">
                  <TextField
                    label={t('comment')}
                    maxLength={500}
                    required
                    value={problem.comment}
                    onChange={(comment) => setProblem({ code: item.code, comment })}
                  />
                  <Button
                    variant="secondary"
                    size="small"
                    disabled={!problem.comment.trim()}
                    loading={answer.isPending}
                    onClick={() =>
                      answer.mutate({
                        code: item.code,
                        result: 'problem',
                        comment: problem.comment.trim(),
                      })
                    }
                  >
                    {t('save')}
                  </Button>
                </Stack>
              ) : null}
            </Stack>
          );
        })}
      </Stack>
    </Card>
  );
}
