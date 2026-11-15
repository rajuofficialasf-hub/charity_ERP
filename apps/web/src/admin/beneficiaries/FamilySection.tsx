import { formatCount, formatTaka } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { DataTable, type DataTableExtendedColumn, Heading, Stack, Text } from '@/ui';
import { Link } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import type { BeneficiaryProfile } from '../../api/schemas';
import { HelpHistory } from './HelpHistory';

type Member = NonNullable<BeneficiaryProfile['familyMembers']>[number];
type MemberOf = NonNullable<BeneficiaryProfile['memberOf']>[number];
type FamilyHelp = NonNullable<BeneficiaryProfile['familyHelp']>;

const profilePath = (id: string) => `/admin/beneficiaries/${id}`;

/**
 * The family on the profile: the household's members now (the latest application's list, every
 * one of them), each linked to the profile it probably is where the server named one for this
 * viewer; the families that probably hold the person as a member; and what the family received. A
 * table of the name, the relationship in its list's words, the age, the monthly income and the
 * profile, and a card per member on a phone. A member without a link shows no hint of one.
 */
export function FamilySection({
  members,
  memberOf,
  help,
}: {
  members: readonly Member[];
  memberOf: readonly MemberOf[];
  help: FamilyHelp | null | undefined;
}) {
  const t = useTranslations('admin.beneficiaries.profile');
  const tf = useTranslations('registration');
  const locale = useLocale() as Locale;
  const empty = tf('profile.empty');
  const words = (name: { bn: string; en: string } | null) =>
    name && (locale === 'en' ? name.en : name.bn);
  const relationship = (m: Member) => words(m.relationship) ?? m.relationshipCode ?? empty;
  const age = (m: Member) => (m.ageYears === null ? empty : t('age_value', { age: m.ageYears }));
  const income = (m: Member) =>
    m.monthlyIncome === null ? empty : formatTaka(m.monthlyIncome, locale);
  const profile = (m: Member) =>
    m.profile ? (
      <Link to={profilePath(m.profile.beneficiaryId)}>
        {t('family.probably', { name: m.profile.name, benNo: m.profile.benNo })}
      </Link>
    ) : (
      empty
    );
  const columns: DataTableExtendedColumn<Member>[] = [
    { id: 'name', header: t('family.name'), cell: (m) => m.name || empty, isRowHeader: true },
    { id: 'relationship', header: t('family.relationship'), cell: relationship },
    { id: 'age', header: t('family.age'), cell: age, numeric: true },
    { id: 'income', header: t('family.income'), cell: income, numeric: true },
    { id: 'profile', header: t('family.profile'), cell: profile },
  ];
  const times = (n: number) => ({ n, count: formatCount(n, locale) });
  return (
    <Stack gap={3}>
      {memberOf.length > 0 && (
        <ul className="admin-plain-list">
          {memberOf.map((f) => {
            const names = f.relationships
              .map((r) => words(r.name) ?? r.code)
              .join(` ${t('family.or')} `);
            const values = { name: f.head.name, benNo: f.head.benNo };
            return (
              <li key={f.head.beneficiaryId}>
                <Link to={profilePath(f.head.beneficiaryId)}>
                  {names
                    ? t('family.member_of', { ...values, relationship: names })
                    : t('family.member_of_plain', values)}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {members.length > 0 && (
        <DataTable
          label={t('family.members')}
          columns={columns}
          rows={members}
          getRowId={(m) => m.id}
          rowLabel={(m) => m.name || empty}
          cardRenderer={(m) => (
            <div className="admin-permission-card">
              <strong>{m.name || empty}</strong>
              <span>{relationship(m)}</span>
              <span>{t('family.card', { age: age(m), income: income(m) })}</span>
              {m.profile && <span>{profile(m)}</span>}
            </div>
          )}
        />
      )}
      {help && 'years' in help && (
        <Stack gap={2}>
          <Heading level={3}>{t('family.help_title')}</Heading>
          <HelpHistory
            help={help}
            none={t('family.help_none')}
            summary={t('family.help_total', {
              people: help.people,
              peopleCount: formatCount(help.people, locale),
              count: formatCount(help.total, locale),
            })}
          />
          {help.notShown > 0 && (
            <Text tone="muted">{t('family.not_shown', times(help.notShown))}</Text>
          )}
        </Stack>
      )}
      {/* no member links to a profile the viewer reaches: only how many others were helped */}
      {help && !('years' in help) && help.notShown > 0 && (
        <Text tone="muted">{t('family.not_shown', times(help.notShown))}</Text>
      )}
    </Stack>
  );
}
