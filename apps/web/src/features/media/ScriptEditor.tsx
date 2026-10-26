import type { MediaScript } from '@css/shared';
import { SCRIPT_STATES, type ScriptState } from '@css/shared/media';
import { Alert, Button, Card, Disclosure, Select, Stack, Text, TextArea } from '@css/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
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
  const [script, setScript] = useState<MediaScript>(work.script ?? {});
  const [state, setState] = useState<ScriptState>(work.scriptState);
  const texts = { stale: t('work.stale'), fallback: tc('state.error.text') };
  const save = useMutation({
    mutationFn: () => {
      const parts = Object.fromEntries(
        PARTS.flatMap((p) => {
          // eslint-disable-next-line security/detect-object-injection -- a fixed part name
          const text = script[p]?.trim();
          return text ? [[p, text]] : [];
        }),
      ) as MediaScript;
      return updateWork(work.id, work.version, { script: parts, scriptState: state });
    },
    onSuccess: (next) => onSaved(next, t('work.script_saved')),
    onError: (error) => {
      if (failureOf(error, texts).stale) onStale();
    },
  });
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
      actions={
        <Text as="small" tone="muted">
          {t(`script_state.${work.scriptState}`)}
        </Text>
      }
    >
      <Stack gap={3}>
        {save.error ? (
          <Alert tone="danger" live="alert">
            {failureOf(save.error, texts).text}
          </Alert>
        ) : null}
        {PARTS.map((part, i) =>
          work.mayEditScript ? (
            <TextArea
              key={part}
              // eslint-disable-next-line security/detect-object-injection -- a fixed part name
              label={t(`script_part.${LABEL[part]}`)}
              maxLength={20000}
              // eslint-disable-next-line security/detect-object-injection -- a fixed part name
              value={script[part] ?? ''}
              onChange={(v) => setScript((all) => ({ ...all, [part]: v }))}
            />
          ) : (
            <Disclosure
              key={part}
              // eslint-disable-next-line security/detect-object-injection -- a fixed part name
              title={t(`script_part.${LABEL[part]}`)}
              defaultOpen={i === 0}
            >
              {/* eslint-disable-next-line security/detect-object-injection -- a fixed part name */}
              <Text>{work.script?.[part] || '—'}</Text>
            </Disclosure>
          ),
        )}
        {work.mayEditScript ? (
          <Stack direction="row" gap={2} wrap align="end">
            <Select
              label={t('work.script_state')}
              value={state}
              options={SCRIPT_STATES.map((s) => ({ id: s, label: t(`script_state.${s}`) }))}
              onChange={(id) => id && setState(id as ScriptState)}
            />
            <Button onPress={() => save.mutate()} loading={save.isPending}>
              {t('work.save_script')}
            </Button>
          </Stack>
        ) : null}
      </Stack>
    </Card>
  );
}
