import { Button, Form, IconButton, TextField } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { useSchemaResolver } from '../../../lib/form-schema';
import { saveSyllabus, type Topic } from './setup-api';
import { SaveNotice, SetupSection, useSetup, useStepSave } from './setup-context';

const MAX_TOPICS = 100;
type Row = { id?: string; title: { bn: string; en: string } };

/** The topics in their order, each with a title in both languages. */
const SYLLABUS_SCHEMA = z.object({
  topics: z.array(
    z.object({
      id: z.string().optional(),
      title: z.object({ bn: z.string().trim().min(1), en: z.string().trim().min(1) }),
    }),
  ),
});
type SyllabusFields = { topics: Row[] };

/** The dawah syllabus topics in their order; a kept topic keeps its id. */
export function SyllabusSection({ topics }: { topics: Topic[] }) {
  const { project, editable, refresh } = useSetup();
  const t = useTranslations('admin.projects.setup');
  const tz = useTranslations('admin.projects.wizard');
  const form = useForm<SyllabusFields>({
    resolver: useSchemaResolver(SYLLABUS_SCHEMA),
    defaultValues: { topics },
    reValidateMode: 'onSubmit',
  });
  const rows = useWatch({ control: form.control, name: 'topics' });
  const setRows = (next: Row[]) => form.setValue('topics', next);
  const can = editable('syllabus');
  const save = useMutation({
    mutationFn: (list: Row[]) => saveSyllabus(project.id, { topics: list }),
  });
  const ready = SYLLABUS_SCHEMA.safeParse({ topics: rows }).success;
  const changed = can && JSON.stringify(rows) !== JSON.stringify(topics);
  const store = async () => {
    // the new topics get their ids, so the next save keeps them
    setRows(await save.mutateAsync(form.getValues('topics')));
    await refresh();
  };
  const problem = useStepSave({
    changed,
    invalid: ready ? undefined : tz('topics_invalid'),
    save: store,
  });
  // the wizard's buttons save the step; Enter in a field only checks it, as before
  const submit = () => undefined;
  const setTitle = (i: number, title: Row['title']) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, title } : r)));
  const move = (i: number, by: number) => {
    const next = [...rows];
    const [row] = next.splice(i, 1);
    next.splice(i + by, 0, row!);
    setRows(next);
  };

  return (
    <SetupSection id="syllabus" title={t('section.syllabus')}>
      <Form form={form} onSubmit={submit} label={t('section.syllabus')}>
        {rows.length === 0 && <p className="admin-muted">{t('no_topics')}</p>}
        {rows.map((r, i) => (
          <div key={r.id ?? `new-${i}`} className="admin-setup-row">
            <TextField
              label={t('topic_bn', { number: String(i + 1) })}
              maxLength={200}
              value={r.title.bn}
              onChange={(bn) => setTitle(i, { ...r.title, bn })}
              readOnly={!can}
            />
            <TextField
              label={t('topic_en', { number: String(i + 1) })}
              maxLength={200}
              lang="en"
              value={r.title.en}
              onChange={(en) => setTitle(i, { ...r.title, en })}
              readOnly={!can}
            />
            {can && (
              <span className="admin-setup-order">
                <IconButton
                  label={t('topic_up', { number: String(i + 1) })}
                  icon="arrow-up"

                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                />
                <IconButton
                  label={t('topic_down', { number: String(i + 1) })}
                  icon="arrow-down"

                  disabled={i === rows.length - 1}
                  onClick={() => move(i, 1)}
                />
                <IconButton
                  label={t('topic_remove', { number: String(i + 1) })}
                  icon="delete"

                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                />
              </span>
            )}
          </div>
        ))}
        {can && (
          <Button
            variant="text"
            size="small"
            startIcon="add"
            disabled={rows.length >= MAX_TOPICS}
            onClick={() => setRows([...rows, { title: { bn: '', en: '' } }])}
          >
            {t('add_topic')}
          </Button>
        )}
        <SaveNotice mutation={save} problem={problem} />
      </Form>
    </SetupSection>
  );
}
