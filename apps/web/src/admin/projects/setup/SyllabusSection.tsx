import { Button, IconButton, TextField } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { saveSyllabus, type Topic } from './setup-api';
import { SaveNotice, SetupSection, useSetup, useStepSave } from './setup-context';

const MAX_TOPICS = 100;
type Row = { id?: string; title: { bn: string; en: string } };

/** The dawah syllabus topics in their order; a kept topic keeps its id. */
export function SyllabusSection({ topics }: { topics: Topic[] }) {
  const { project, editable, refresh } = useSetup();
  const t = useTranslations('admin.projects.setup');
  const tz = useTranslations('admin.projects.wizard');
  const [rows, setRows] = useState<Row[]>(topics);
  const can = editable('syllabus');
  const save = useMutation({
    mutationFn: () => saveSyllabus(project.id, { topics: rows }),
  });
  const ready = rows.every((r) => r.title.bn.trim() && r.title.en.trim());
  const problem = useStepSave({
    changed: can && JSON.stringify(rows) !== JSON.stringify(topics),
    invalid: ready ? undefined : tz('topics_invalid'),
    save: async () => {
      // the new topics get their ids, so the next save keeps them
      setRows(await save.mutateAsync());
      await refresh();
    },
  });
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
    </SetupSection>
  );
}
