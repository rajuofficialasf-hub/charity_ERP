import {
  DETAIL_OPTIONS,
  PROFESSION_FIELDS,
  type Profession,
  PROFESSIONS,
} from '@css/shared/registration';
import { useTranslations } from 'use-intl';

/**
 * The profession, the skills and the emergency contact as lines of text (DECISION_LOG O-65, D-092),
 * for the own profile and for the approver's registration: one line per given value, labelled in
 * the language of the page.
 */
const isProfession = (value: string | null): value is Profession =>
  value !== null && (PROFESSIONS as readonly string[]).includes(value);

function Lines({ lines }: { lines: string[] }) {
  return (
    <div className="profile-lines">
      {lines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
}

/** The profession and its details; "not given" when no profession was given. */
export function ProfessionText({
  profession,
  details,
}: {
  profession: string | null;
  details: Record<string, unknown>;
}) {
  const t = useTranslations('registration');
  if (!isProfession(profession)) return <span className="profile-empty">{t('profile.empty')}</span>;
  const lines = [t(`lists.profession.${profession}`)];
  for (const field of PROFESSION_FIELDS[profession]) {
    const value = details[field];
    if (value === undefined || value === null || value === '') continue;
    const label = t(
      `lists.profession_field.${profession}.${field}` as 'lists.profession_field.student.subject',
    );
    const shown =
      typeof value === 'boolean'
        ? t(value ? 'form.yes' : 'form.no')
        : field in DETAIL_OPTIONS
          ? t(`lists.option.${field}.${String(value)}` as 'lists.option.role.imam')
          : String(value);
    lines.push(`${label}: ${shown}`);
  }
  return <Lines lines={lines} />;
}

/** The skills; "not given" when none was given. */
export function SkillsText({
  interestAreas,
  vehicle,
  canSwim,
  availability,
}: {
  interestAreas: string[];
  vehicle: string | null;
  canSwim: boolean | null;
  availability: string | null;
}) {
  const t = useTranslations('registration');
  const lines = [
    interestAreas.length
      ? `${t('form.interest_areas')}: ${interestAreas
          .map((a) => t(`lists.interest.${a}` as 'lists.interest.media'))
          .join(', ')}`
      : null,
    vehicle
      ? `${t('form.vehicle_short')}: ${t(`lists.vehicle.${vehicle}` as 'lists.vehicle.none')}`
      : null,
    canSwim === null ? null : `${t('form.swimming_short')}: ${t(canSwim ? 'form.yes' : 'form.no')}`,
    availability
      ? `${t('form.availability_short')}: ${t(`lists.availability.${availability}` as 'lists.availability.anytime')}`
      : null,
  ].filter((line): line is string => line !== null);
  return lines.length ? (
    <Lines lines={lines} />
  ) : (
    <span className="profile-empty">{t('profile.empty')}</span>
  );
}

/** The emergency contact as "name, mobile"; null when none was given. */
export function emergencyText(contact: { name: string | null; mobile: string | null }) {
  const text = [contact.name, contact.mobile].filter(Boolean).join(', ');
  return text || null;
}
