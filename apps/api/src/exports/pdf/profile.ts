import { formatCount, formatDate, formatTaka } from '@css/shared/format';
import { translate } from '@css/shared/i18n';
import { documentHtml, html } from './html.js';
import { codeText, dateText, factsHtml, tableHtml } from './record.js';

/**
 * A beneficiary's 360° profile as the export stored it: the profile route's response, masked with
 * the export's classes, so a fact the person may not export is simply absent.
 */
export interface ProfileForPdf {
  benNo: number;
  name: string;
  fatherOrHusbandName?: string;
  motherName?: string | null;
  genderCode?: string;
  ageYears?: number | null;
  classCode?: string | null;
  status: string;
  divisionId: string;
  districtId: string;
  upazilaId: string;
  unionId?: string;
  village?: string;
  postOffice?: string | null;
  postCode?: string | null;
  /** Null for a person reached through their volunteer; absent where the export may not carry it. */
  mobile?: string | null;
  /** Whether an identity document is on file; absent where the export may not say. */
  hasDocument?: boolean;
  nid?: string | null;
  birthReg?: string | null;
  familyMembers?: {
    name: string;
    relationshipCode: string | null;
    relationship?: { bn: string; en: string } | null;
    ageYears: number | null;
    monthlyIncome?: number | null;
    /** The profile the member probably is, where the requester reaches it. */
    profile?: ProfileRef | null;
  }[];
  /** The families that probably hold the person, each head the requester reaches. */
  memberOf?: { head: ProfileRef; relationships: { code: string; name: Words | null }[] }[];
  /** What the family received, with the application history class; absent or null otherwise. */
  /** Or, where no member links to a profile the requester reaches, only the count of the others. */
  familyHelp?:
    | {
        total: number;
        people: number;
        notShown: number;
        years: {
          year: number;
          count: number;
          projects: { id: string; nameBn: string; nameEn: string; count: number }[];
          unnamed: number;
        }[];
      }
    | { notShown: number }
    | null;
  projectsByYear: {
    year: number;
    projects: { id: string; nameBn: string; nameEn: string; status: string }[];
  }[];
  applications?: {
    appNo: string | null;
    projectId: string;
    status: string;
    submittedAt: string | null;
    approvedAt: string | null;
  }[];
}

interface ProfileRef {
  beneficiaryId: string;
  benNo: string;
  name: string;
}
interface Words {
  bn: string;
  en: string;
}

/** The 360° profile printed portrait: identity, contact and address, family, projects. */
export function profileHtml(input: {
  locale: 'bn' | 'en';
  profile: ProfileForPdf;
  places: ReadonlyMap<string, string>;
  date: Date;
}): string {
  const { locale, profile: p, places } = input;
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const fact = (label: string, value: string | number | null | undefined) =>
    value === undefined || value === null ? null : { label, value: String(value) };
  const projectNames = new Map(
    p.projectsByYear.flatMap((y) =>
      y.projects.map((pr) => [pr.id, locale === 'en' ? pr.nameEn : pr.nameBn] as const),
    ),
  );
  const inWords = (w: Words | null | undefined) => (w ? (locale === 'en' ? w.en : w.bn) : null);
  const probably = (ref: ProfileRef | null | undefined) =>
    ref
      ? translate(locale, 'exports.pdf.record.probably', { name: ref.name, benNo: ref.benNo })
      : '';
  // the family's help where a member links to a profile the export reaches, else only the count
  const summed = p.familyHelp && 'years' in p.familyHelp ? p.familyHelp : null;
  const notShown = p.familyHelp?.notShown ?? 0;
  const address = [p.village, p.unionId, p.upazilaId, p.districtId, p.divisionId]
    .map((part, i) => (i === 0 ? part : part ? places.get(part) : undefined))
    .filter(Boolean)
    .join(', ');
  const body = html`<h1>${p.name}</h1>
    <p class="meta">
      ${t('exports.column.beneficiaries.ben_no')}: ${String(p.benNo)} · ${formatDate(input.date)}
    </p>
    ${factsHtml(t('exports.pdf.record.identity'), [
      p.hasDocument === false
        ? fact(t('exports.pdf.record.document'), t('common.person.no_document'))
        : null,
      fact(t('exports.column.beneficiaries.nid'), p.nid),
      fact(t('exports.column.beneficiaries.birth_reg'), p.birthReg),
      fact(t('exports.column.beneficiaries.father'), p.fatherOrHusbandName),
      fact(t('exports.column.beneficiaries.mother'), p.motherName),
      fact(
        t('exports.column.beneficiaries.gender'),
        p.genderCode && codeText(p.genderCode, 'reference.gender', locale),
      ),
      fact(t('exports.column.beneficiaries.age'), p.ageYears),
      fact(
        t('exports.column.beneficiaries.class'),
        p.classCode && codeText(p.classCode, 'reference.beneficiary_class', locale),
      ),
      fact(
        t('exports.column.beneficiaries.status'),
        codeText(p.status, 'beneficiary.status', locale),
      ),
    ])}
    ${factsHtml(t('exports.pdf.record.contact'), [
      fact(
        t('exports.column.beneficiaries.mobile'),
        p.mobile === null ? t('common.person.through_volunteer') : p.mobile,
      ),
      fact(t('exports.pdf.record.address'), address),
      fact(t('exports.pdf.record.post_office'), p.postOffice),
      fact(t('exports.pdf.record.post_code'), p.postCode),
    ])}
    ${tableHtml(
      t('exports.pdf.record.family'),
      [
        t('exports.column.beneficiaries.name'),
        t('exports.pdf.record.relationship'),
        t('exports.column.beneficiaries.age'),
        t('exports.pdf.record.income'),
        t('exports.pdf.record.profile'),
      ],
      (p.familyMembers ?? []).map((m) => [
        m.name,
        inWords(m.relationship) ?? m.relationshipCode ?? '',
        m.ageYears === null ? '' : String(m.ageYears),
        m.monthlyIncome === null || m.monthlyIncome === undefined
          ? ''
          : formatTaka(m.monthlyIncome, locale),
        probably(m.profile),
      ]),
    )}
    ${factsHtml(
      t('exports.pdf.record.member_of'),
      (p.memberOf ?? []).map((f) => ({
        label: probably(f.head),
        value: f.relationships.map((r) => inWords(r.name) ?? r.code).join(', '),
      })),
    )}
    ${
      summed
        ? html`${tableHtml(
            t('exports.pdf.record.family_help'),
            [
              t('exports.pdf.record.year'),
              t('exports.pdf.record.project'),
              t('exports.pdf.record.times'),
            ],
            summed.years.flatMap((y) => [
              ...y.projects.map((pr) => [
                String(y.year),
                locale === 'en' ? pr.nameEn : pr.nameBn,
                formatCount(pr.count, locale),
              ]),
              ...(y.unnamed
                ? [
                    [
                      String(y.year),
                      t('exports.pdf.record.unnamed'),
                      formatCount(y.unnamed, locale),
                    ],
                  ]
                : []),
            ]),
          )}`
        : html``
    }
    ${
      notShown
        ? html`<p class="meta">
            ${translate(locale, 'exports.pdf.record.not_shown', {
              count: formatCount(notShown, locale),
            })}
          </p>`
        : html``
    }
    ${tableHtml(
      t('exports.pdf.record.applications'),
      [
        t('exports.column.applications.app_no'),
        t('exports.pdf.record.project'),
        t('exports.column.applications.status'),
        t('exports.column.applications.submitted'),
        t('exports.pdf.record.approved'),
      ],
      (p.applications ?? []).map((a) => [
        a.appNo ?? '',
        projectNames.get(a.projectId) ?? '',
        codeText(a.status, 'application.status', locale),
        dateText(a.submittedAt),
        dateText(a.approvedAt),
      ]),
    )}`;
  return documentHtml({
    locale,
    title: `${t('exports.pdf.title.beneficiary_profile')}: ${p.name}`,
    landscape: false,
    body,
  });
}
