import { formatDate } from '@css/shared/format';
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
  mobile?: string;
  nid?: string | null;
  birthReg?: string | null;
  familyMembers?: { name: string; relationshipCode: string | null; ageYears: number | null }[];
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
  const address = [p.village, p.unionId, p.upazilaId, p.districtId, p.divisionId]
    .map((part, i) => (i === 0 ? part : part ? places.get(part) : undefined))
    .filter(Boolean)
    .join(', ');
  const body = html`<h1>${p.name}</h1>
    <p class="meta">
      ${t('exports.column.beneficiaries.ben_no')}: ${String(p.benNo)} · ${formatDate(input.date)}
    </p>
    ${factsHtml(t('exports.pdf.record.identity'), [
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
      fact(t('exports.column.beneficiaries.mobile'), p.mobile),
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
      ],
      (p.familyMembers ?? []).map((m) => [
        m.name,
        m.relationshipCode ?? '',
        m.ageYears === null ? '' : String(m.ageYears),
      ]),
    )}
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
