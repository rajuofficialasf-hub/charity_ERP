import {
  type Answer,
  evaluate,
  type FieldState,
  fieldPath,
  type FormDefinition,
  type FormField,
  type FormSection,
  validate,
} from '@css/shared/forms';
import type { AnswerValue } from '@css/shared';
import { formatCount } from '@css/shared/format';
import { Alert, Button, Stack, Stepper, Text } from '@css/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { removeRow, setAnswer, answerOf } from './answers';
import { FieldInput } from './FieldInput';
import { RepeatGroup } from './RepeatGroup';
import type { UploadAdapter } from './upload-adapter';
import { useFormAnswers } from './use-form-answers';

/** What a screen receives when the form is sent: the clean answers and the client id. */
export interface Submission {
  answers: Answer[];
  clientUuid: string;
}

export interface RendererProps {
  /** The version as the API returned it for the caller. */
  definition: FormDefinition;
  /** Whose screen this is: official-only sections are never drawn for anyone else. */
  audience: 'official' | 'volunteer' | 'public';
  /** Today in Dhaka, `yyyy-mm-dd`, for ages. */
  today: string;
  nisabValue?: string;
  /**
   * Where the answers wait in the tab; without it nothing is stored. The screen names in it whose
   * answers they are and the form version they belong to, so another person or a newer version
   * never finds them.
   */
  storageKey?: string;
  upload?: UploadAdapter;
  /** One part per screen (a phone), the whole form on one page, or by the width of the screen. */
  layout?: 'steps' | 'page' | 'auto';
  submitLabel?: string;
  /**
   * Sends the form. When it throws, the answers and the client id stay for the next try and the
   * error's message is shown above the form (a screen throws an Error with the text to show).
   */
  onSubmit?: (submission: Submission) => Promise<void>;
  /** Messages the server gave for named questions after a send. */
  serverErrors?: Record<string, string>;
}

const PHONE = '(max-width: 767px)';
/** One empty set of server messages, so a screen that passes none keeps the same object. */
const NO_ERRORS: Record<string, string> = {};

/** The key a path names: `key` or `key[row]`. */
const keyOf = (path: string) => path.replace(/\[\d+\]$/, '');

function usePhone(layout: RendererProps['layout']) {
  const [phone, setPhone] = useState(() =>
    layout === 'auto' ? window.matchMedia?.(PHONE).matches === true : layout === 'steps',
  );
  useEffect(() => {
    if (layout !== 'auto' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(PHONE);
    const update = () => setPhone(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [layout]);
  return layout === 'auto' ? phone : layout === 'steps';
}

/**
 * Draws a form version and collects its answers. The shared engine decides what is visible,
 * required and offered on every change, works out the calculations, and checks the answers of a
 * part before the next one and of the whole form before it is sent, with the same rules the server
 * checks again.
 */
export function FormRenderer({
  definition,
  audience,
  today,
  nisabValue,
  storageKey,
  upload,
  layout = 'auto',
  submitLabel,
  onSubmit,
  serverErrors = NO_ERRORS,
}: RendererProps) {
  const t = useTranslations('forms.renderer');
  const te = useTranslations('errors');
  const locale = useLocale();
  const phone = usePhone(layout);
  // an official-only section is drawn only on an official's screen, whatever the version holds
  const form = useMemo<FormDefinition>(
    () => ({
      sections: definition.sections.filter(
        (s) => audience === 'official' || s.visibility !== 'official_only',
      ),
    }),
    [definition, audience],
  );
  const initialRows = useMemo(() => {
    const rows: Record<string, number> = {};
    for (const f of form.sections.flatMap((s) => s.fields))
      if (f.type === 'repeat_group') rows[f.fieldKey] = f.settings?.repeat?.min_rows ?? 0;
    return rows;
  }, [form]);
  const { state, setState, clear } = useFormAnswers(storageKey, initialRows);
  // each file goes up as part of this application, named by its client id
  const fieldUpload = useMemo(
    () =>
      upload && {
        ...upload,
        upload: (file: File, fieldKey: string) => upload.upload(file, fieldKey, state.clientUuid),
      },
    [upload, state.clientUuid],
  );
  const context = useMemo(
    () => ({ today, ...(nisabValue ? { nisabValue } : {}) }),
    [today, nisabValue],
  );
  const evaluation = useMemo(() => evaluate(form, state.answers, context), [form, state, context]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sendingNow = useRef(false);
  const [uploading, setUploading] = useState<ReadonlySet<string>>(new Set());
  // a server message stands until the person changes that answer, or a new send brings new ones
  const [edited, setEdited] = useState<ReadonlySet<string>>(new Set());
  const [seenServer, setSeenServer] = useState(serverErrors);
  if (seenServer !== serverErrors) {
    setSeenServer(serverErrors);
    setEdited(new Set());
  }

  const visible = form.sections.filter((s) => evaluation.sections[s.key] !== false);
  const step = Math.min(state.step, Math.max(0, visible.length - 1));
  const shown = phone ? visible.slice(step, step + 1) : visible;
  const allErrors: Record<string, string> = { ...errors };
  for (const [path, message] of Object.entries(serverErrors))
    if (!edited.has(path) && !allErrors[path]) allErrors[path] = message;

  const messageOf = (code: string, params?: Record<string, unknown>) => {
    const key = code as Parameters<typeof te>[0];
    return te.has(key) ? te(key, params as never) : te('validation.failed');
  };
  /** The engine's messages by path, for the questions of the given sections. */
  const problemsIn = (sections: readonly FormSection[]) => {
    const result = validate(form, state.answers, { audience, ...context });
    const found: Record<string, string> = {};
    if (result.ok) return found;
    const keys = new Set(sections.flatMap((s) => s.fields.map((f) => f.fieldKey)));
    for (const e of result.errors)
      if (keys.has(keyOf(e.path))) found[e.path] = messageOf(e.code, e.params);
    return found;
  };

  const change = (field: FormField, row: number, inGroup: boolean, value: AnswerValue | null) => {
    setState((s) => setAnswer(s, field.fieldKey, row, inGroup, value));
    const path = fieldPath(field.fieldKey, row, inGroup);
    if (errors[path]) setErrors(({ [path]: _gone, ...rest }) => rest);
    if (path in serverErrors) setEdited((set) => new Set(set).add(path));
  };

  const next = () => {
    if (uploading.size) return setSummary(t('upload_wait'));
    const found = problemsIn(shown);
    if (Object.keys(found).length) {
      setErrors(found);
      setSummary(t('fix_step', { count: formatCount(Object.keys(found).length, locale) }));
      return;
    }
    setErrors({});
    setSummary(null);
    setState((s) => ({ ...s, step: Math.min(step + 1, visible.length - 1) }));
  };
  const previous = () => {
    setSummary(null);
    setState((s) => ({ ...s, step: Math.max(0, step - 1) }));
  };
  const send = async () => {
    if (sendingNow.current) return;
    if (uploading.size) return setSummary(t('upload_wait'));
    const result = validate(form, state.answers, { audience, ...context });
    if (!result.ok) {
      const found: Record<string, string> = {};
      for (const e of result.errors) found[e.path] = messageOf(e.code, e.params);
      setErrors(found);
      setSummary(t('fix_before', { count: formatCount(Object.keys(found).length, locale) }));
      // on a phone, go to the first part with a problem
      const first = visible.findIndex((s) =>
        s.fields.some((f) => Object.keys(found).some((p) => keyOf(p) === f.fieldKey)),
      );
      if (phone && first >= 0) setState((s) => ({ ...s, step: first }));
      return;
    }
    if (!onSubmit) return;
    setErrors({});
    setSummary(null);
    sendingNow.current = true;
    setSending(true);
    try {
      await onSubmit({ answers: result.answers, clientUuid: state.clientUuid });
      clear();
    } catch (error) {
      setSummary(error instanceof Error && error.message ? error.message : t('send_failed'));
    } finally {
      sendingNow.current = false;
      setSending(false);
    }
  };

  const renderField = (field: FormField, row: number, inGroup: boolean) => {
    const path = fieldPath(field.fieldKey, row, inGroup);
    const fallback: FieldState = {
      visible: true,
      required: field.required,
      options: field.options ?? [],
    };
    const fieldState = evaluation.fields[path] ?? fallback;
    if (!fieldState.visible) return null;
    return (
      <FieldInput
        key={`${path}:${state.generation}`}
        id={`field-${path}`}
        field={field}
        state={fieldState}
        value={answerOf(state, field.fieldKey, row)}
        computed={evaluation.computed[path]}
        error={allErrors[path]}
        onChange={(value) => change(field, row, inGroup, value)}
        upload={fieldUpload}
        onUploading={(busy) =>
          setUploading((set) => {
            const next = new Set(set);
            if (busy) next.add(path);
            else next.delete(path);
            return next;
          })
        }
        nisabKnown={nisabValue !== undefined}
      />
    );
  };

  const renderSection = (section: FormSection) => {
    const groups = new Map<string, FormField[]>();
    for (const f of section.fields) {
      const group = f.settings?.repeat?.group;
      if (group) groups.set(group, [...(groups.get(group) ?? []), f]);
    }
    return (
      <Stack as="section" key={section.key} gap={3} aria-labelledby={`section-${section.key}`}>
        <Text as="strong" id={`section-${section.key}`} weight="bold">
          {section.title[locale]}
        </Text>
        {section.fields.map((field) => {
          if (field.settings?.repeat?.group) return null;
          if (field.type !== 'repeat_group') return renderField(field, 0, false);
          if (evaluation.fields[field.fieldKey]?.visible === false) return null;
          const members = groups.get(field.fieldKey) ?? [];
          const rows = Math.max(
            state.rows[field.fieldKey] ?? 0,
            evaluation.rows[field.fieldKey] ?? 0,
          );
          return (
            <Stack key={field.fieldKey} gap={1}>
              <RepeatGroup
                group={field}
                rows={rows}
                renderRow={(row) => members.map((m) => renderField(m, row, true))}
                onAdd={() =>
                  setState((s) => ({ ...s, rows: { ...s.rows, [field.fieldKey]: rows + 1 } }))
                }
                onRemove={(row) =>
                  setState((s) =>
                    removeRow(
                      { ...s, rows: { ...s.rows, [field.fieldKey]: rows } },
                      field.fieldKey,
                      members.map((m) => m.fieldKey),
                      row,
                    ),
                  )
                }
              />
              {allErrors[field.fieldKey] ? (
                <Alert tone="danger">{allErrors[field.fieldKey]}</Alert>
              ) : null}
            </Stack>
          );
        })}
      </Stack>
    );
  };

  const last = !phone || step >= visible.length - 1;
  return (
    <Stack gap={4}>
      {phone && visible.length > 1 ? (
        <Stack gap={2}>
          <Stepper
            steps={visible.map((s) => s.title[locale])}
            current={step}
            label={t('steps_label')}
          />
          <Text tone="muted">
            {t('step', {
              current: formatCount(step + 1, locale),
              total: formatCount(visible.length, locale),
            })}
          </Text>
        </Stack>
      ) : null}
      {summary ? (
        <Alert tone="danger" live="alert">
          {summary}
        </Alert>
      ) : null}
      {shown.map(renderSection)}
      <Stack direction="row" gap={2} justify="between" wrap>
        {phone && step > 0 ? (
          <Button variant="secondary" onPress={previous}>
            {t('previous')}
          </Button>
        ) : (
          <span />
        )}
        {last ? (
          <Button variant="primary" onPress={() => void send()} loading={sending}>
            {sending ? t('sending') : (submitLabel ?? t('submit'))}
          </Button>
        ) : (
          <Button variant="primary" onPress={next}>
            {t('next')}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
