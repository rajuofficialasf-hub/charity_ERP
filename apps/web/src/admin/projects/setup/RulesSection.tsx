import {
  type ProjectRules,
  requiredRuleParts,
  RULES_PARTS,
  type RulesPart,
} from '@css/shared/projects';
import { Form, FormTextField } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { useSchemaResolver } from '../../../lib/form-schema';
import { type RulesVersion, saveRules } from './setup-api';
import { SaveNotice, SetupSection, useSetup, useStepSave } from './setup-context';

type Texts = Record<RulesPart, { bn: string; en: string }>;
const EMPTY = { bn: '', en: '' };

/** Each part's texts in both languages, as typed; the step says what a running project needs. */
const RULES_SCHEMA = z.object(
  Object.fromEntries(
    RULES_PARTS.map((part) => [part, z.object({ bn: z.string(), en: z.string() })]),
  ) as Record<RulesPart, z.ZodObject<{ bn: z.ZodString; en: z.ZodString }>>,
);

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
 * The four rules texts every volunteer reads and accepts before working on the project: the Local
 * দায়ী part only while dawah is on. A draft may keep them unfinished (the review lists what
 * activation still needs); a running project keeps every required text. Each saved change is a new
 * version that every volunteer accepts again.
 */
export function RulesSection({ current }: { current: RulesVersion }) {
  const { project, editable, refresh } = useSetup();
  const t = useTranslations('admin.projects.rules');
  const tp = useTranslations('admin.projects.rules_part');
  const ts = useTranslations('admin.projects.setup.section');
  const start = textsOf(current.rules);
  const form = useForm<Texts>({
    resolver: useSchemaResolver(RULES_SCHEMA),
    defaultValues: start,
    reValidateMode: 'onSubmit',
  });
  const texts = useWatch({ control: form.control }) as Texts;
  // the version the server gave the last save, shown until the next one
  const [version, setVersion] = useState(current.version);
  const can = editable('rules');
  const required = requiredRuleParts(project.dawahEnabled);
  const shown = RULES_PARTS.filter((part) => required.includes(part));
  const save = useMutation({ mutationFn: (v: Texts) => saveRules(project.id, body(v)) });
  // eslint-disable-next-line security/detect-object-injection -- part comes from RULES_PARTS
  const complete = required.every((part) => texts[part].bn.trim() && texts[part].en.trim());
  const changed = can && JSON.stringify(body(texts)) !== JSON.stringify(body(start));
  const store = async () => {
    setVersion((await save.mutateAsync(form.getValues())).version);
    await refresh();
  };
  // a running project never loses a text its volunteers accept; a draft may save part of them
  const invalid = project.status !== 'draft' && !complete ? t('invalid') : undefined;
  const problem = useStepSave({ changed, invalid, save: store });
  // the wizard's buttons save the step; Enter in a field only checks it, as before
  const submit = () => undefined;

  return (
    <SetupSection id="rules" title={ts('rules')}>
      <Form form={form} onSubmit={submit} label={ts('rules')}>
        {version > 0 && (
          <p className="admin-muted">
            {t('version', { version: String(version) })} · {t('new_version')}
          </p>
        )}
        {shown.map((part) => (
          <div key={part} className="admin-setup-grid">
            <FormTextField
              name={`${part}.bn`}
              label={t('field_bn', { part: tp(part) })}
              required
              maxLength={10_000}
              rows={4}
              readOnly={!can}
            />
            <FormTextField
              name={`${part}.en`}
              label={t('field_en', { part: tp(part) })}
              required
              maxLength={10_000}
              rows={4}
              lang="en"
              readOnly={!can}
            />
          </div>
        ))}
        <SaveNotice mutation={save} problem={problem} />
      </Form>
    </SetupSection>
  );
}
