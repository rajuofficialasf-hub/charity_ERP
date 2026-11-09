import {
  type ProjectRules,
  requiredRuleParts,
  RULES_PARTS,
  type RulesPart,
} from '@css/shared/projects';
import { TextField } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { type RulesVersion, saveRules } from './setup-api';
import { SaveNotice, SetupSection, useSetup, useStepSave } from './setup-context';

type Texts = Record<RulesPart, { bn: string; en: string }>;
const EMPTY = { bn: '', en: '' };

/** Every part's texts, an empty pair where none is stored. */
function textsOf(rules: ProjectRules): Texts {
  const texts = {} as Texts;
  // eslint-disable-next-line security/detect-object-injection -- part comes from RULES_PARTS
  for (const part of RULES_PARTS) texts[part] = rules[part] ?? EMPTY;
  return texts;
}

/** The texts to send: every part with something written, the hidden Local দায়ী part kept. */
function body(texts: Texts): ProjectRules {
  return Object.fromEntries(
    RULES_PARTS.flatMap((part) => {
      // eslint-disable-next-line security/detect-object-injection -- part comes from RULES_PARTS
      const text = texts[part];
      return text.bn.trim() || text.en.trim() ? [[part, text]] : [];
    }),
  );
}

/**
 * The four rules texts every volunteer reads and accepts before working on the project (BR-039;
 * DECISION_LOG D-096): the Local দায়ী part only while dawah is on. A draft may keep them unfinished
 * (the review lists what activation still needs); a running project keeps every required text.
 * Each saved change is a new version that every volunteer accepts again.
 */
export function RulesSection({ current }: { current: RulesVersion }) {
  const { project, editable, refresh } = useSetup();
  const t = useTranslations('admin.projects.rules');
  const tp = useTranslations('admin.projects.rules_part');
  const ts = useTranslations('admin.projects.setup.section');
  const start = textsOf(current.rules);
  const [texts, setTexts] = useState<Texts>(start);
  const [version, setVersion] = useState(current.version);
  const can = editable('rules');
  const required = requiredRuleParts(project.dawahEnabled);
  const shown = RULES_PARTS.filter((part) => required.includes(part));
  const save = useMutation({ mutationFn: () => saveRules(project.id, body(texts)) });
  // eslint-disable-next-line security/detect-object-injection -- part comes from RULES_PARTS
  const complete = required.every((part) => texts[part].bn.trim() && texts[part].en.trim());
  const problem = useStepSave({
    changed: can && JSON.stringify(body(texts)) !== JSON.stringify(body(start)),
    // a running project never loses a text its volunteers accept; a draft may save part of them
    invalid: project.status !== 'draft' && !complete ? t('invalid') : undefined,
    save: async () => {
      setVersion((await save.mutateAsync()).version);
      await refresh();
    },
  });
  const set = (part: RulesPart, text: { bn: string; en: string }) =>
    setTexts({ ...texts, [part]: text });

  return (
    <SetupSection id="rules" title={ts('rules')}>
      {version > 0 && (
        <p className="admin-muted">
          {t('version', { version: String(version) })} · {t('new_version')}
        </p>
      )}
      {shown.map((part) => {
        // eslint-disable-next-line security/detect-object-injection -- part comes from RULES_PARTS
        const text = texts[part];
        return (
          <div key={part} className="admin-setup-grid">
            <TextField
              label={t('field_bn', { part: tp(part) })}
              required
              maxLength={10_000}
              rows={4}
              value={text.bn}
              onChange={(bn) => set(part, { ...text, bn })}
              readOnly={!can}
            />
            <TextField
              label={t('field_en', { part: tp(part) })}
              required
              maxLength={10_000}
              rows={4}
              lang="en"
              value={text.en}
              onChange={(en) => set(part, { ...text, en })}
              readOnly={!can}
            />
          </div>
        );
      })}
      <SaveNotice mutation={save} problem={problem} />
    </SetupSection>
  );
}
