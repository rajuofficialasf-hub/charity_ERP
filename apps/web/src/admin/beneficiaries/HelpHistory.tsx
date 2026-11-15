import { formatCount } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Chip, Stack, Text } from '@/ui';
import { useLocale, useTranslations } from 'use-intl';
import type { BeneficiaryProfile } from '../../api/schemas';

type Help = NonNullable<BeneficiaryProfile['help']>;

/**
 * How often the person was helped, on the profile (docs/BUSINESS_RULES.md, BR-307): the total,
 * since which year and this year, the marks for more than once in a year and in one project, and
 * the years newest first with each project's times; a year or a project with more than one shows
 * its number. Help in a project the viewer does not see is counted in its year without a name.
 */
export function HelpHistory({ help }: { help: Help }) {
  const t = useTranslations('admin.beneficiaries.profile.help');
  const locale = useLocale() as Locale;
  const times = (n: number) => ({ n, count: formatCount(n, locale) });
  const nameOf = (p: { nameBn: string; nameEn: string }) => (locale === 'en' ? p.nameEn : p.nameBn);
  if (help.total === 0) return <p className="admin-muted">{t('none')}</p>;
  return (
    <Stack gap={2}>
      <Stack direction="row" wrap gap={2}>
        <strong>{t('total', times(help.total))}</strong>
        {help.firstYear !== null && <span>{t('since', { year: String(help.firstYear) })}</span>}
        <span className="admin-muted">{t('this_year', times(help.thisYear))}</span>
      </Stack>
      {(help.repeatedInYear || help.repeatedInProject) && (
        <Stack direction="row" wrap gap={1}>
          {help.repeatedInYear && <Chip tone="warning">{t('repeated_in_year')}</Chip>}
          {help.repeatedInProject && <Chip tone="warning">{t('repeated_in_project')}</Chip>}
        </Stack>
      )}
      <ul className="admin-plain-list">
        {help.years.map((y) => (
          <li className="admin-plain-item" key={y.year}>
            <Stack direction="row" wrap gap={2}>
              <strong>{String(y.year)}</strong>
              {y.count > 1 && <Chip tone="warning">{t('times', times(y.count))}</Chip>}
            </Stack>
            {y.projects.map((p) => (
              <Stack direction="row" wrap gap={2} key={p.id}>
                <span>{nameOf(p)}</span>
                {p.count > 1 && <Text tone="muted">{t('times', times(p.count))}</Text>}
              </Stack>
            ))}
            {y.unnamed > 0 && <Text tone="muted">{t('unnamed', times(y.unnamed))}</Text>}
          </li>
        ))}
      </ul>
    </Stack>
  );
}
