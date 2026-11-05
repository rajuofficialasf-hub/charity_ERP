import { type Locale, localized } from '@css/shared/i18n';
import { SelectField } from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import { useAuth } from '../../lib/auth';
import { canSeeProjects } from '../roles';
import { pickerProjects, PROJECTS_KEY } from './projects-api';

/**
 * Picks a project by its name and year (the project filter of the volunteer and the beneficiary
 * tab); the value is the project id. Shows nothing to a role without the project list, or when the
 * caller reaches no project.
 */
export function ProjectPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (projectId: string | null) => void;
}) {
  const t = useTranslations('admin.projects');
  const locale = useLocale() as Locale;
  const { me } = useAuth();
  const list = useQuery({
    queryKey: [...PROJECTS_KEY, 'picker'],
    queryFn: pickerProjects,
    enabled: Boolean(me && canSeeProjects(me)),
  });
  const projects = list.data ?? [];
  // a chosen project stays visible and can be cleared, even when it is not among the listed ones
  if (!projects.length && !value) return null;
  const unlisted = value && !projects.some((p) => p.id === value);
  return (
    <SelectField
      label={t('picker')}
      hint={list.error ? t('picker_failed') : undefined}
      value={value ?? ''}
      // the searchable kind has a clear button, so the filter can go back to every project
      searchable
      onChange={(id) => onChange(id || null)}
      options={[
        ...(unlisted ? [{ value: value ?? '', label: t('picker_chosen') }] : []),
        ...projects.map((p) => ({
          value: p.id,
          label: t('picker_option', {
            name: localized(p.name, locale),
            year: String(p.year),
            code: p.code,
          }),
        })),
      ]}
    />
  );
}
