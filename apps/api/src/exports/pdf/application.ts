import type { AnswerValue } from '@css/shared';
import type { FormDefinition } from '@css/shared/forms';
import type { Bilingual } from '@css/shared/i18n';
import { translate } from '@css/shared/i18n';
import { cellOf } from '../questions';
import { documentHtml, html, type SafeHtml } from './html';
import { cellText, codeText, dateText, factsHtml } from './record';

/** Questions that hold no value of their own, or only files, which a PDF never prints. */
const NO_VALUE = new Set(['repeat_group', 'note', 'photo', 'file', 'signature']);

/**
 * One application as the export stored it: the record route's response masked with the export's
 * classes, its answers and form already without the sections and answers it may not carry.
 */
export interface ApplicationForPdf {
  appNo: string | null;
  projectId: string;
  status: string;
  stage: string | null;
  outcome: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  totalScore?: number | null;
  decisionComment?: string | null;
  answers: { fieldKey: string; repeatIndex: number; value: AnswerValue }[];
  form: Pick<FormDefinition, 'sections'>;
}

/** The application printed portrait: its facts, then its answers section by section. */
export function applicationHtml(input: {
  locale: 'bn' | 'en';
  application: ApplicationForPdf;
  projectName: Bilingual;
  places: ReadonlyMap<string, string>;
}): string {
  const { locale, application: a, places } = input;
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  // eslint-disable-next-line security/detect-object-injection -- the locale is one of two literals
  const project = input.projectName[locale];
  const fact = (label: string, value: string | number | null | undefined) =>
    value === undefined || value === null ? null : { label, value: String(value) };
  const byField = new Map<string, Map<number, AnswerValue>>();
  for (const answer of a.answers) {
    const rows = byField.get(answer.fieldKey) ?? new Map<number, AnswerValue>();
    rows.set(answer.repeatIndex, answer.value);
    byField.set(answer.fieldKey, rows);
  }
  const sections: SafeHtml[] = a.form.sections.map((section) =>
    factsHtml(
      // eslint-disable-next-line security/detect-object-injection -- the locale is one of two literals
      section.title[locale],
      section.fields
        .filter((field) => !NO_VALUE.has(field.type))
        .map((field) => {
          const rows = byField.get(field.fieldKey);
          if (!rows) return null;
          const options = new Map((field.options ?? []).map((o) => [o.code, o.label]));
          const value = [...rows.entries()]
            .sort(([x], [y]) => x - y)
            .map(([, v]) => cellText(cellOf(v, options, locale, places), locale))
            .filter(Boolean)
            .join('; ');
          // eslint-disable-next-line security/detect-object-injection -- the locale is one of two literals
          return { label: field.label[locale], value };
        }),
    ),
  );
  const title = `${t('exports.pdf.title.application')}: ${a.appNo ?? ''}`;
  const body = html`<h1>${title}</h1>
    <p class="meta">${project}</p>
    ${factsHtml(t('exports.pdf.record.application'), [
      fact(t('exports.column.applications.app_no'), a.appNo),
      fact(t('exports.pdf.record.project'), project),
      fact(
        t('exports.column.applications.status'),
        codeText(a.status, 'application.status', locale),
      ),
      fact(t('exports.column.applications.stage'), a.stage),
      fact(t('exports.column.applications.outcome'), a.outcome),
      fact(t('exports.column.applications.submitted'), dateText(a.submittedAt)),
      fact(t('exports.pdf.record.reviewed'), dateText(a.reviewedAt)),
      fact(t('exports.pdf.record.approved'), dateText(a.approvedAt)),
      fact(t('exports.column.applications.score'), a.totalScore),
      fact(t('exports.pdf.record.comment'), a.decisionComment),
    ])}
    ${sections}`;
  return documentHtml({ locale, title, landscape: false, body });
}
