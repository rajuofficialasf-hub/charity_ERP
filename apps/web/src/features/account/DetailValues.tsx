import {
  DETAIL_OPTIONS,
  PROFESSION_FIELDS,
  type Profession,
  PROFESSIONS,
} from '@css/shared/registration';
import { useTranslations } from 'use-intl';
import { AddressNames } from '../../components/AddressNames';

/**
 * The profession, the skills (with the full-time answer), the education and the permanent address
 * as lines of text,
 * for the own profile and for the approver's registration: one line per given value, labelled in
 * the language of the page.
 */
const isProfession = (value: string | null): value is Profession =>
  value !== null && (PROFESSIONS as readonly string[]).includes(value);

function Lines({ lines }: { lines: string[] }) {
  return (
    <div>
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
  emergencyFullTime,
}: {
  interestAreas: string[];
  vehicle: string | null;
  canSwim: boolean | null;
  availability: string | null;
  emergencyFullTime: boolean | null;
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
    emergencyFullTime === null
      ? null
      : `${t('form.emergency_full_time_short')}: ${t(emergencyFullTime ? 'form.yes' : 'form.no')}`,
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

/** The education as lines of text; "not given" when nothing was given. */
export function EducationText({ education }: { education: Record<string, unknown> }) {
  const t = useTranslations('registration');
  const text = (key: string) => {
    const v = education[key];
    return typeof v === 'string' && v ? v : null;
  };
  const qualification = text('highestQualification');
  const status = text('status');
  const lines = [
    qualification
      ? `${t('form.highest_qualification')}: ${t(`lists.qualification.${qualification}` as 'lists.qualification.ssc')}`
      : null,
    text('institutionName') ? `${t('form.institution_name')}: ${text('institutionName')}` : null,
    text('subject') ? `${t('form.edu_subject')}: ${text('subject')}` : null,
    typeof education.passingYear === 'number'
      ? `${t('form.passing_year')}: ${education.passingYear}`
      : null,
    text('result') ? `${t('form.result')}: ${text('result')}` : null,
    status
      ? `${t('form.edu_status')}: ${t(`lists.education_status.${status}` as 'lists.education_status.studying')}`
      : null,
  ].filter((line): line is string => line !== null);
  return lines.length ? (
    <Lines lines={lines} />
  ) : (
    <span className="profile-empty">{t('profile.empty')}</span>
  );
}

/** The permanent address: the village or house line, then the names of the four levels. */
export function PermanentAddressText({ address }: { address: Record<string, unknown> | null }) {
  const t = useTranslations('registration');
  if (!address) return <span className="profile-empty">{t('profile.empty')}</span>;
  const id = (key: string) => (typeof address[key] === 'string' ? (address[key] as string) : null);
  const line = id('addressLine');
  return (
    <>
      {line ? `${line}, ` : ''}
      <AddressNames
        address={{
          divisionId: id('divisionId'),
          districtId: id('districtId'),
          upazilaId: id('upazilaId'),
          unionId: id('unionId'),
        }}
      />
    </>
  );
}
