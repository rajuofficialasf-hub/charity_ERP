import type { MediaScript } from '@css/shared';
import { SCRIPT_STATES } from '@css/shared/media';
import { Button, Card, Disclosure, Form, FormSelectField, FormTextField, Stack, Text } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { useSchemaResolver } from '../../lib/form-schema';
import { type MediaReferral, type MediaWork, updateWork } from './media-api';
import { failureOf } from './work-errors';

const PARTS = ['summary', 'questions', 'scenes', 'voiceOver', 'notes'] as const;
type Part = (typeof PARTS)[number];

const LABEL: Record<Part, 'summary' | 'questions' | 'scenes' | 'voice_over' | 'notes'> = {
  summary: 'summary',
  questions: 'questions',
  scenes: 'scenes',
  voiceOver: 'voice_over',
  notes: 'notes',
};

/** The five parts as typed, each free and left out when empty, and the script's state. */
const SCRIPT_SCHEMA = z.object({
  script: z.object({
    summary: z.string(),
    questions: z.string(),
    scenes: z.string(),
    voiceOver: z.string(),
    notes: z.string(),
  }),
  scriptState: z.enum(SCRIPT_STATES),
});
type ScriptFields = z.infer<typeof SCRIPT_SCHEMA>;

/**
 * The work's script in its five parts and its state; saved with the version the caller read, so a
 * change someone made meanwhile is not overwritten: the page reads the work again and says so.
 */
export function ScriptEditor({
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
  const stored: MediaScript = work.script ?? {};
  const form = useForm<ScriptFields>({
    resolver: useSchemaResolver(SCRIPT_SCHEMA),
    defaultValues: {
      script: {
        summary: stored.summary ?? '',
        questions: stored.questions ?? '',
        scenes: stored.scenes ?? '',
        voiceOver: stored.voiceOver ?? '',
        notes: stored.notes ?? '',
      },
      scriptState: work.scriptState,
    },
    reValidateMode: 'onSubmit',
  });
  const texts = { stale: t('work.stale'), fallback: tc('state.error.text') };
  const save = useMutation({
    mutationFn: ({ script, scriptState }: ScriptFields) => {
      const parts = Object.fromEntries(
        PARTS.flatMap((p) => {
          // eslint-disable-next-line security/detect-object-injection -- a fixed part name
          const text = script[p].trim();
          return text ? [[p, text]] : [];
        }),
      ) as MediaScript;
      return updateWork(work.id, work.version, { script: parts, scriptState });
    },
    onSuccess: (next) => onSaved(next, t('work.script_saved')),
    onError: (error) => {
      if (failureOf(error, texts).stale) onStale();
    },
  });
  // nothing twice while a save is on its way
  const send = (fields: ScriptFields) => {
    if (!save.isPending) save.mutate(fields);
  };
  if (!work.script)
    return (
      <Card title={t('work.script')} headingLevel={2}>
        <Text tone="muted">{t('work.script_hidden')}</Text>
      </Card>
    );
  return (
    <Card
      title={t('work.script')}
      headingLevel={2}
      action={
        <Text size="small" tone="muted">
          {t(`script_state.${work.scriptState}`)}
        </Text>
      }
    >
      {work.mayEditScript ? (
        <Form
          form={form}
          onSubmit={send}
          label={t('work.script')}
          error={save.error ? failureOf(save.error, texts).text : undefined}
        >
          {PARTS.map((part) => (
            <FormTextField
              rows={4}
              key={part}
              name={`script.${part}`}
              // eslint-disable-next-line security/detect-object-injection -- a fixed part name
              label={t(`script_part.${LABEL[part]}`)}
              maxLength={20000}
            />
          ))}
          <Stack direction="row" gap={2} wrap align="end">
            <FormSelectField
              name="scriptState"
              label={t('work.script_state')}
              options={SCRIPT_STATES.map((s) => ({ value: s, label: t(`script_state.${s}`) }))}
            />
            <Button type="submit" loading={save.isPending}>
              {t('work.save_script')}
            </Button>
          </Stack>
        </Form>
      ) : (
        <Stack gap={3}>
          {PARTS.map((part, i) => (
            <Disclosure
              key={part}
              // eslint-disable-next-line security/detect-object-injection -- a fixed part name
              title={t(`script_part.${LABEL[part]}`)}
              defaultOpen={i === 0}
            >
              {/* eslint-disable-next-line security/detect-object-injection -- a fixed part name */}
              <Text>{work.script?.[part] || '—'}</Text>
            </Disclosure>
          ))}
        </Stack>
      )}
    </Card>
  );
}
