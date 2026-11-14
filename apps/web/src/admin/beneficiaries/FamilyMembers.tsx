import { formatTaka } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { DataTable, type DataTableExtendedColumn } from '@/ui';
import { useLocale, useTranslations } from 'use-intl';
import type { BeneficiaryProfile } from '../../api/schemas';

type Member = NonNullable<BeneficiaryProfile['familyMembers']>[number];

/**
 * The household's members on the profile, as the latest application that listed them gave them:
 * a small table of the name, the relationship in its list's words, the age and the monthly
 * income, and a card per member on a phone. The section is drawn only where a member is known.
 */
export function FamilyMembers({ members }: { members: readonly Member[] }) {
  const t = useTranslations('admin.beneficiaries.profile');
  const tf = useTranslations('registration');
  const locale = useLocale() as Locale;
  const empty = tf('profile.empty');
  const relationship = (m: Member) =>
    (m.relationship && (locale === 'en' ? m.relationship.en : m.relationship.bn)) ??
    m.relationshipCode ??
    empty;
  const age = (m: Member) => (m.ageYears === null ? empty : t('age_value', { age: m.ageYears }));
  const income = (m: Member) =>
    m.monthlyIncome === null ? empty : formatTaka(m.monthlyIncome, locale);
  const columns: DataTableExtendedColumn<Member>[] = [
    { id: 'name', header: t('family.name'), cell: (m) => m.name || empty, isRowHeader: true },
    { id: 'relationship', header: t('family.relationship'), cell: relationship },
    { id: 'age', header: t('family.age'), cell: age, numeric: true },
    { id: 'income', header: t('family.income'), cell: income, numeric: true },
  ];
  return (
    <DataTable
      label={t('sections.family')}
      columns={columns}
      rows={members}
      getRowId={(m) => m.id}
      rowLabel={(m) => m.name || empty}
      cardRenderer={(m) => (
        <div className="admin-permission-card">
          <strong>{m.name || empty}</strong>
          <span>{relationship(m)}</span>
          <span>{t('family.card', { age: age(m), income: income(m) })}</span>
        </div>
      )}
    />
  );
}
