import {
  checkDefinition,
  CORE_FIELD_KEYS,
  type CoreFieldKey,
  type DefinitionIssue,
  type DefinitionIssueCode,
  FORM_TEXT_KINDS,
  type FormDefinition,
  type FormKind,
  type FormTextKind,
  isCoreFieldKey,
} from '@css/shared/forms';
import type { ApiErrorDetail } from '../../api/client';
import type { Selection } from './selection';

/** Where a line of the publish list leads: a question or a part of the form, or the points of the score. */
export type EntryTarget = Selection | 'scoring';
/** The place of an entry; none when the problem is the whole form's. */
export type EntryPlace = EntryTarget | null;

/** The groups of the publish list, in the order they are shown. */
export const ENTRY_GROUPS = ['identity', 'texts', 'other', 'server'] as const;
export type EntryGroup = (typeof ENTRY_GROUPS)[number];

/**
 * One line of what stands between the draft and its publishing.
 * `identity`: the identity roles no question is marked with yet, all in one line.
 * `texts`: a kind of text of a question or a part that lacks a language, with how many do.
 * `other`: any other problem the check of the draft finds, by its catalogue code.
 * `server`: what the server said last that the check of the draft does not know, in its words.
 */
export type PublishEntry =
  | { group: 'identity'; id: string; roles: CoreFieldKey[] }
  | {
      group: 'texts';
      id: string;
      place: Selection;
      text: FormTextKind;
      language: 'bn' | 'en';
      count: number;
    }
  | { group: 'other'; id: string; place: EntryPlace; code: DefinitionIssueCode }
  | { group: 'server'; id: string; place: EntryPlace; path: string; message: string };

const isTextKind = (text: string | undefined): text is FormTextKind =>
  (FORM_TEXT_KINDS as readonly string[]).includes(text ?? '');

/** The question the path of an issue points into, and the part it sits in. */
function atPath(definition: FormDefinition, path: DefinitionIssue['path']) {
  const [root, si, inner, fi] = path;
  const section = root === 'sections' && typeof si === 'number' ? definition.sections.at(si) : null;
  const field = inner === 'fields' && typeof fi === 'number' ? section?.fields.at(fi) : undefined;
  return { section: section ?? null, field: field ?? null };
}

const placeOfField = (definition: FormDefinition, fieldKey: string): Selection | null => {
  const section = definition.sections.find((s) => s.fields.some((f) => f.fieldKey === fieldKey));
  return section ? { section: section.key, field: fieldKey } : null;
};

/** Where an issue of the draft's check is: the question the engine names, else the one at its path. */
function placeOf(definition: FormDefinition, issue: DefinitionIssue): EntryPlace {
  if (issue.path[0] === 'scoring') return 'scoring';
  const at = atPath(definition, issue.path);
  if (at.field) {
    const named = issue.params?.fieldKey;
    return (
      (named ? placeOfField(definition, named) : null) ?? {
        section: at.section!.key,
        field: at.field.fieldKey,
      }
    );
  }
  return at.section ? { section: at.section.key } : null;
}

const placeKey = (place: EntryPlace, path: DefinitionIssue['path']): string =>
  place === null
    ? `at:${path.join('.')}`
    : place === 'scoring'
      ? 'scoring'
      : place.field
        ? `field:${place.field}`
        : `section:${place.section}`;

/**
 * The key a refusal of the server names an issue by, as the API words its details: the question
 * the engine names, else the question or the part at the issue's path, else the path itself.
 */
function serverPath(definition: FormDefinition, issue: DefinitionIssue): string {
  if (issue.params?.fieldKey) return issue.params.fieldKey;
  const at = atPath(definition, issue.path);
  return at.field?.fieldKey ?? at.section?.key ?? issue.path.join('.');
}

/**
 * What makes two problems the same one, on the server and here: the code and the key it names;
 * for a missing text also which text and language, since only that code carries its parameters.
 */
function mark(code: string, path: string, params: Record<string, string> | undefined): string {
  if (code !== 'form.label_language') return `${code}|${path}`;
  const which = params?.option ?? params?.row ?? params?.col ?? params?.result ?? '';
  return [code, path, params?.text, params?.language, which].join('|');
}

/**
 * What stands between a draft and its publishing: every problem the engine's publish check finds
 * in the draft, grouped and counted for the list, then what the server refused last (`refused`,
 * the details of a 422 of the publish or of the save) where the check here does not find it. The
 * check is the server's own, so an entry leaves as soon as its cause does; a server-only entry
 * stays for as long as the caller passes it.
 */
export function publishEntries(
  definition: FormDefinition,
  kind: FormKind | undefined,
  refused: readonly ApiErrorDetail[] = [],
): PublishEntry[] {
  const issues = checkDefinition(definition, { publishing: true, ...(kind ? { kind } : {}) });
  const known = new Set(issues.map((i) => mark(i.code, serverPath(definition, i), i.params)));
  const roles: CoreFieldKey[] = [];
  const texts = new Map<string, Extract<PublishEntry, { group: 'texts' }>>();
  const others = new Map<string, Extract<PublishEntry, { group: 'other' }>>();
  for (const issue of issues) {
    const role = issue.params?.role;
    if (issue.code === 'form.core_field_missing') {
      if (role && isCoreFieldKey(role)) roles.push(role);
      continue;
    }
    const place = placeOf(definition, issue);
    const text = issue.params?.text;
    const language = issue.params?.language;
    if (
      issue.code === 'form.label_language' &&
      place !== null &&
      place !== 'scoring' &&
      isTextKind(text) &&
      (language === 'bn' || language === 'en')
    ) {
      const id = ['texts', placeKey(place, issue.path), text, language].join('|');
      const entry = texts.get(id);
      if (entry) entry.count += 1;
      else texts.set(id, { group: 'texts', id, place, text, language, count: 1 });
      continue;
    }
    const id = `${issue.code}|${placeKey(place, issue.path)}`;
    if (!others.has(id)) others.set(id, { group: 'other', id, place, code: issue.code });
  }

  const server = new Map<string, Extract<PublishEntry, { group: 'server' }>>();
  for (const detail of refused) {
    const path = detail.path ?? '';
    if (known.has(mark(detail.code, path, detail.params))) continue;
    const id = `server|${detail.code}|${path}`;
    if (server.has(id)) continue;
    const section = definition.sections.find((s) => s.key === path);
    const place = placeOfField(definition, path) ?? (section ? { section: section.key } : null);
    server.set(id, { group: 'server', id, place, path, message: detail.message });
  }

  return [
    ...(roles.length
      ? [
          {
            group: 'identity' as const,
            id: 'identity',
            roles: CORE_FIELD_KEYS.filter((k) => roles.includes(k)),
          },
        ]
      : []),
    ...texts.values(),
    ...others.values(),
    ...server.values(),
  ];
}

/** How many texts of the form still lack a language, over every entry of the list. */
export const missingTexts = (entries: readonly PublishEntry[]): number =>
  entries.reduce((n, e) => (e.group === 'texts' ? n + e.count : n), 0);

/**
 * What is to fix at each question and each part, in the words of the list. A place that is here
 * has something to fix; its lines may be none, when the server's own message already says it.
 */
export interface PlaceProblems {
  fields: ReadonlyMap<string, readonly string[]>;
  sections: ReadonlyMap<string, readonly string[]>;
}

/**
 * The entries that lead to a question or a part, worded, by the place each leads to. What only
 * the server said marks its place without a line: the canvas shows the server's message there.
 */
export function problemsByPlace(
  entries: readonly PublishEntry[],
  say: (entry: PublishEntry) => string,
): PlaceProblems {
  const fields = new Map<string, string[]>();
  const sections = new Map<string, string[]>();
  for (const entry of entries) {
    if (entry.group === 'identity' || entry.place === null || entry.place === 'scoring') continue;
    const [into, key] = entry.place.field
      ? [fields, entry.place.field]
      : [sections, entry.place.section];
    into.set(key, [...(into.get(key) ?? []), ...(entry.group === 'server' ? [] : [say(entry)])]);
  }
  return { fields, sections };
}
