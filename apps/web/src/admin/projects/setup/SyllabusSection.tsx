import { Button, TextField } from '@css/ui';
import { useMutation } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { saveSyllabus, type Topic } from './setup-api';
import { SaveRow, SetupSection, useSetup } from './setup-context';

const MAX_TOPICS = 100;
type Row = { id?: string; title: { bn: string; en: string } };

/** The dawah syllabus topics in their order; a kept topic keeps its id. */
export function SyllabusSection({ topics }: { topics: Topic[] }) {
  const { project, editable, refresh } = useSetup();
  const t = useTranslations('admin.projects.setup');
  const [rows, setRows] = useState<Row[]>(topics);
  const can = editable('syllabus');
  const save = useMutation({
    mutationFn: () => saveSyllabus(project.id, { topics: rows }),
    onSuccess: refresh,
  });
  const setTitle = (i: number, title: Row['title']) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, title } : r)));
  const move = (i: number, by: number) => {
    const next = [...rows];
    const [row] = next.splice(i, 1);
    next.splice(i + by, 0, row!);
    setRows(next);
  };
  const ready = rows.every((r) => r.title.bn.trim() && r.title.en.trim());

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
              <Button
                variant="ghost"
                size="sm"
                icon={ArrowUp}
                iconOnly
                disabled={i === 0}
                onPress={() => move(i, -1)}
              >
                {t('topic_up', { number: String(i + 1) })}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={ArrowDown}
                iconOnly
                disabled={i === rows.length - 1}
                onPress={() => move(i, 1)}
              >
                {t('topic_down', { number: String(i + 1) })}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                iconOnly
                onPress={() => setRows(rows.filter((_, j) => j !== i))}
              >
                {t('topic_remove', { number: String(i + 1) })}
              </Button>
            </span>
          )}
        </div>
      ))}
      {can && (
        <>
          <Button
            variant="ghost"
            size="sm"
            icon={Plus}
            disabled={rows.length >= MAX_TOPICS}
            onPress={() => setRows([...rows, { title: { bn: '', en: '' } }])}
          >
            {t('add_topic')}
          </Button>
          <SaveRow mutation={save} onSave={() => save.mutate()} disabled={!ready} />
        </>
      )}
    </SetupSection>
  );
}
