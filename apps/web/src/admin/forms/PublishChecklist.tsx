import type { FormDefinition } from '@css/shared/forms';
import { localized, type Locale } from '@css/shared/i18n';
import { Button, Dialog, Heading, Stack, Text } from '@/ui';
import { useCallback } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import {
  ENTRY_GROUPS,
  type EntryGroup,
  type EntryTarget,
  type PublishEntry,
} from './publish-entries';

/** What a group of the list offers beside its entries: one button that settles them. */
export interface GroupAction {
  label: string;
  onSelect: () => void;
}

/**
 * The words of an entry of the publish list, the same in the list and on the canvas: the identity
 * roles by name, a missing text by its place and language, any other problem in the errors
 * catalogue's words, and the server's own words for what only the server knows.
 */
export function useEntryWords(): (entry: PublishEntry) => string {
  const t = useTranslations('forms.builder');
  const te = useTranslations('errors');
  return useCallback(
    (entry) => {
      if (entry.group === 'identity')
        return t('publish_list.identity', {
          roles: entry.roles.map((role) => t(`identity.roles.${role}`)).join(', '),
        });
      if (entry.group === 'texts') {
        const what = t(`publish_list.text.${entry.text}.${entry.language}`);
        return entry.count > 1 ? t('publish_list.many', { what, n: String(entry.count) }) : what;
      }
      return entry.group === 'other' ? te(entry.code) : entry.message;
    },
    [t, te],
  );
}

/**
 * What stands between the draft and its publishing, beside the Publish button: a button with the
 * number of entries, hidden when there is none, and the list it opens, grouped as the identity
 * questions, the missing texts, the other problems and what the server said last. A line that has
 * a place is a button that leads there (`onGo`); a group may carry an action of its own
 * (`actions`). The entries are computed by the page from the draft, so the list holds no state.
 */
export function PublishChecklist({
  entries,
  definition,
  open,
  onOpen,
  onClose,
  onGo,
  actions = {},
}: {
  entries: readonly PublishEntry[];
  /** The draft, for the names of its questions and parts. */
  definition: FormDefinition;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** The person picked a line: the page shows its place. */
  onGo: (place: EntryTarget) => void;
  actions?: Partial<Record<EntryGroup, GroupAction>>;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale() as Locale;
  const say = useEntryWords();
  if (entries.length === 0) return null;

  /** The name of the question or the part an entry leads to; none for the points of the score. */
  const nameOf = (place: EntryTarget): string | null => {
    if (place === 'scoring') return null;
    const section = definition.sections.find((s) => s.key === place.section);
    if (!place.field)
      return (section && localized(section.title, locale)) || t('publish_list.unnamed_section');
    const field = section?.fields.find((f) => f.fieldKey === place.field);
    return (field && localized(field.label, locale)) || t('publish_list.unnamed_question');
  };
  const line = (entry: PublishEntry) => {
    const what = say(entry);
    const place = entry.group === 'identity' ? null : entry.place;
    if (place === null) return <p className="fb-fix-plain">{what}</p>;
    const name = nameOf(place);
    return (
      <button
        type="button"
        className="fb-fix-item"
        aria-label={name === null ? undefined : t('publish_list.line', { name, what })}
        onClick={() => onGo(place)}
      >
        {name === null ? null : <span className="fb-fix-name">{name}</span>}
        <span>{what}</span>
      </button>
    );
  };

  return (
    <>
      <Button variant="secondary" startIcon="warning" onClick={onOpen}>
        {t('publish_list.button', { n: String(entries.length) })}
      </Button>
      <Dialog title={t('publish_list.title')} open={open} onClose={onClose}>
        <Stack gap={3}>
          <Text tone="muted">{t('publish_list.intro')}</Text>
          {ENTRY_GROUPS.map((group) => {
            const own = entries.filter((e) => e.group === group);
            if (own.length === 0) return null;
            // eslint-disable-next-line security/detect-object-injection -- a group of the fixed list
            const action = actions[group];
            return (
              <div key={group} className="fb-fix-group">
                {/* the identity line names itself, so it needs no heading */}
                {group === 'identity' ? null : (
                  <Heading level={3}>{t(`publish_list.groups.${group}`)}</Heading>
                )}
                {group === 'server' ? (
                  <Text tone="muted">{t('publish_list.server_hint')}</Text>
                ) : null}
                <ul className="fb-fix-list">
                  {own.map((entry) => (
                    <li key={entry.id}>{line(entry)}</li>
                  ))}
                </ul>
                {action ? (
                  <div>
                    <Button size="small" variant="secondary" onClick={action.onSelect}>
                      {action.label}
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </Stack>
      </Dialog>
    </>
  );
}
