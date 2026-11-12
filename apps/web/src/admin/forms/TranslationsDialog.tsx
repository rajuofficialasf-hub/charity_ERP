import { type FormDefinition, identityRoleOf } from '@css/shared/forms';
import { localized, type Locale } from '@css/shared/i18n';
import { Button, Dialog, Heading, Icon, Stack, Switch, Text, TextField } from '@/ui';
import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { type FormTextRow, missingIn, missingTextCount, setText, textsOf } from './draft';
import type { Typed } from './use-draft-history';

type Language = 'bn' | 'en';

/** How many rows are drawn at first; the rest follow without holding the screen. */
const FIRST_ROWS = 60;
const MORE_ROWS = 120;

/** A row as the dialog draws it: the text, its name in plain words and what is said about it. */
interface Line {
  row: FormTextRow;
  /** What the text is: "প্রশ্ন 2", "প্রশ্ন 2: অপশন 1", "অংশের নাম". */
  what: string;
  /**
   * A word above the two fields: the identity role of a question, the question a text belongs to
   * when that question's own row is not in view, the note of a list's options.
   */
  about: string | null;
}
type Write = (row: FormTextRow, language: Language, value: string) => void;

const idsOfMissing = (rows: readonly FormTextRow[]): ReadonlySet<string> =>
  new Set(rows.filter((row) => missingIn(row).length > 0).map((row) => row.id));

/**
 * Every text of the form in both languages, side by side, part by part in the form's order: a
 * part's name, then each question's text with its help text, options, table rows and columns and
 * calculation results under it. A text that lacks a language carries a mark, the line above the
 * list counts how many do (the number the list beside Publish counts), and "missing only" leaves
 * the incomplete rows, which stay in view while they are being written. What is typed goes into
 * the draft at once, each field a step of its own for the undo. The options a reference list
 * gives are shown to read. A long form is drawn a part at a time, and a keystroke draws one row
 * again, not the list.
 */
export function TranslationsDialog({
  definition,
  onlyMissing = false,
  onChange,
  onClose,
}: {
  definition: FormDefinition;
  /** Opens on the incomplete rows alone. */
  onlyMissing?: boolean;
  /** `how` names the field a text was typed in, so the history joins that field's typing. */
  onChange: (definition: FormDefinition, how?: Typed) => void;
  onClose: () => void;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale() as Locale;
  const rows = useMemo(() => textsOf(definition), [definition]);
  const missing = missingTextCount(rows);
  const [only, setOnly] = useState(onlyMissing);
  // the rows that were incomplete when "missing only" was switched on: they stay while written
  const [kept, setKept] = useState(() => idsOfMissing(rows));
  const [limit, setLimit] = useState(FIRST_ROWS);

  // the rows keep one handler for good, which reads the draft as it is at the keystroke
  const latest = useRef({ definition, onChange });
  useEffect(() => {
    latest.current = { definition, onChange };
  });
  const write = useCallback<Write>((row, language, value) => {
    const now = latest.current;
    now.onChange(setText(now.definition, row, language, value), {
      merge: true,
      key: `${row.id}|${language}`,
    });
  }, []);

  const shown = only ? rows.filter((row) => kept.has(row.id) || missingIn(row).length > 0) : rows;
  useEffect(() => {
    if (limit < shown.length) startTransition(() => setLimit((n) => n + MORE_ROWS));
  }, [limit, shown.length]);

  // the number of each question in its part, its name, and the identity role of a marked one
  const numbers = new Map<string, number>();
  const names = new Map<string, string>();
  const roles = new Map<string, string>();
  for (const section of definition.sections)
    section.fields.forEach((field, i) => {
      numbers.set(field.fieldKey, i + 1);
      names.set(
        field.fieldKey,
        localized(field.label, locale) || t('publish_list.unnamed_question'),
      );
      const role = identityRoleOf(field);
      if (role) roles.set(field.fieldKey, t('identity.tag', { role: t(`identity.roles.${role}`) }));
    });
  /** A row as it is drawn; `above` is the question of the row drawn just before it. */
  const lineOf = (row: FormTextRow, above: string | undefined): Line => {
    const question = row.place.field;
    const about =
      question === undefined
        ? []
        : row.kind === 'label'
          ? [roles.get(question)]
          : [
              // a text of a question whose own row is not in view names its question
              above === question
                ? undefined
                : t('translations.of_question', { name: names.get(question) ?? '' }),
              row.locked && row.index === 0 ? t('translations.from_list') : undefined,
            ];
    return {
      row,
      what: t(`translations.what.${row.kind}`, {
        n: String(numbers.get(question ?? '') ?? ''),
        i: String(row.index + 1),
      }),
      about: about.filter((x): x is string => x !== undefined).join(' · ') || null,
    };
  };

  const drawn = shown.slice(0, limit);
  const parts = definition.sections
    .map((section) => {
      let above: string | undefined;
      return {
        key: section.key,
        title: localized(section.title, locale) || t('publish_list.unnamed_section'),
        lines: drawn
          .filter((row) => row.place.section === section.key)
          .map((row) => {
            const line = lineOf(row, above);
            above = row.place.field;
            return line;
          }),
      };
    })
    .filter((part) => part.lines.length > 0);

  return (
    <Dialog
      title={t('translations.title')}
      size="large"
      fullScreenOnPhone
      open
      onClose={onClose}
      actions={<Button onClick={onClose}>{t('translations.done')}</Button>}
    >
      <Stack gap={3}>
        <Text tone="muted">{t('translations.intro')}</Text>
        <div className="fb-tr-bar">
          <p className="fb-tr-count" role="status">
            {missing > 0
              ? t('translations.missing_count', { n: String(missing) })
              : t('translations.none_missing')}
          </p>
          <Switch
            label={t('translations.only_missing')}
            checked={only}
            onChange={(on) => {
              if (on) setKept(idsOfMissing(rows));
              setOnly(on);
            }}
          />
        </div>
        {parts.map((part) => (
          <section key={part.key} className="fb-tr-part" aria-label={part.title}>
            <Heading level={3}>{part.title}</Heading>
            <ul className="fb-tr-list">
              {part.lines.map((line) => (
                <TextLine
                  key={line.row.id}
                  row={line.row}
                  what={line.what}
                  about={line.about}
                  onWrite={write}
                />
              ))}
            </ul>
          </section>
        ))}
        {only && parts.length === 0 ? <Text>{t('translations.nothing_left')}</Text> : null}
      </Stack>
    </Dialog>
  );
}

/** A row is the same to draw while its texts, its name and its note are. */
function sameLine(a: Line & { onWrite: Write }, b: Line & { onWrite: Write }): boolean {
  return (
    a.row.id === b.row.id &&
    a.row.bn === b.row.bn &&
    a.row.en === b.row.en &&
    a.row.locked === b.row.locked &&
    a.what === b.what &&
    a.about === b.about &&
    a.onWrite === b.onWrite
  );
}

/** One text in both languages; drawn again only when it changes. */
const TextLine = memo(function TextLine({ row, what, about, onWrite }: Line & { onWrite: Write }) {
  const t = useTranslations('forms.builder');
  const lacks = missingIn(row);
  // an icon with a name, so a missing text is not told by colour alone
  const mark = (language: Language) =>
    lacks.includes(language) ? (
      <span className="fb-tag fb-tag-warn">
        <Icon name="warning" size={16} label={t('translations.missing')} />
      </span>
    ) : undefined;
  const sub = row.kind !== 'label' && row.kind !== 'title';
  return (
    <li className={`fb-tr-row${sub ? ' is-sub' : ''}`}>
      {about ? <span className="fb-tr-about">{about}</span> : null}
      <div className="fb-tr-pair">
        <TextField
          label={t('translations.field_bn', { what })}
          value={row.bn}
          readOnly={row.locked}
          endAction={mark('bn')}
          onChange={(value) => onWrite(row, 'bn', value)}
        />
        <TextField
          label={t('translations.field_en', { what })}
          lang="en"
          value={row.en}
          readOnly={row.locked}
          endAction={mark('en')}
          onChange={(value) => onWrite(row, 'en', value)}
        />
      </div>
    </li>
  );
}, sameLine);
