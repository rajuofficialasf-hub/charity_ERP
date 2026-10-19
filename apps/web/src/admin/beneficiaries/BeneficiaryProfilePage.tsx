import { formatDate } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Avatar,
  Badge,
  Breadcrumb,
  ContactList,
  DescriptionList,
  EmptyState,
  ErrorState,
  Grid,
  type ProfileFact,
  ProfileHeader,
  ProfileSection,
  Skeleton,
  Stack,
  Text,
  Timeline,
} from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Briefcase,
  CalendarDays,
  ClipboardList,
  Hash,
  History,
  MapPin,
  Package,
  PhoneCall,
  Phone,
  User,
  Users,
  UserX,
} from 'lucide-react';
import { type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { useLocationName } from '../../components/AddressNames';
import { DocumentTitle } from '../../components/DocumentTitle';
import { useFileDataUrl } from '../../components/FileImage';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { telLink } from '../contact-links';
import { canSeeBeneficiaries } from '../roles';
import {
  BENEFICIARIES_KEY,
  BENEFICIARY_TYPES,
  type BeneficiaryProfile,
  beneficiaryProfile,
} from './beneficiaries-api';

/**
 * The 360° profile of one beneficiary (SCR-045 shell, UX-22): the header card with the key facts,
 * then the basic details and address, the family, the application history, distribution and
 * implementation, dawah and follow-ups beside the contact, the projects by year and the activity
 * history. Each section shows real data where it exists and an empty state otherwise; a section the
 * server left out (the limited views of the Media and Procurement Teams) is not shown at all, and a
 * value it left out is never a chip of the header.
 */
export function BeneficiaryProfilePage() {
  const { me } = useAuth();
  const { beneficiaryId = '' } = useParams();
  const t = useTranslations('admin.beneficiaries.profile');
  const tc = useTranslations('common');
  const profile = useQuery({
    queryKey: [...BENEFICIARIES_KEY, 'profile', beneficiaryId],
    queryFn: () => beneficiaryProfile(beneficiaryId),
    retry: false,
    // a caller without the tab is shown the refusal without asking the server
    enabled: !!me && canSeeBeneficiaries(me),
  });
  if (!me) return null;
  if (!canSeeBeneficiaries(me)) return <ForbiddenContent />;
  const back = (
    <div>
      <Link to="/admin/beneficiaries">{t('back')}</Link>
    </div>
  );
  if (profile.isPending) return <Skeleton count={4} />;
  if (profile.error instanceof ApiFailure && profile.error.status === 404)
    return (
      <>
        {back}
        <EmptyState icon={UserX} title={t('not_found')} />
      </>
    );
  if (profile.error || !profile.data)
    return (
      <>
        {back}
        <ErrorState
          title={tc('state.error.text')}
          requestId={profile.error instanceof ApiFailure ? profile.error.requestId : undefined}
          onRetry={() => void profile.refetch()}
        />
      </>
    );
  return <Profile profile={profile.data} />;
}

function Profile({ profile: p }: { profile: BeneficiaryProfile }) {
  const t = useTranslations('admin.beneficiaries');
  const tp = useTranslations('admin.beneficiaries.profile');
  const tf = useTranslations('registration');
  const locale = useLocale() as Locale;
  const empty = tf('profile.empty');
  const hidden = tp('hidden');
  const nameOf = (project: { nameBn: string; nameEn: string }) =>
    locale === 'en' ? project.nameEn : project.nameBn;
  const projectName = new Map(
    p.projectsByYear.flatMap((y) => y.projects.map((project) => [project.id, nameOf(project)])),
  );
  const typeLabel = (code: string | null | undefined) =>
    code && (BENEFICIARY_TYPES as readonly string[]).includes(code)
      ? t(`types.${code as 'other'}`)
      : (code ?? empty);
  const optional = (key: keyof BeneficiaryProfile, label: string, value: ReactNode) =>
    key in p ? [{ label, value }] : [];
  const none = <Text className="admin-muted">{tp('no_rows')}</Text>;
  const identity = p.nid ?? p.birthReg;

  const facts: ProfileFact[] = [
    ...(identity
      ? [{ id: 'id', label: tp('nid'), value: identity, icon: Hash, showLabel: true, copy: true }]
      : []),
    ...(p.mobile
      ? [{ id: 'mobile', label: tp('mobile'), value: p.mobile, icon: Phone, copy: true }]
      : []),
    ...(p.genderCode
      ? [
          {
            id: 'gender',
            label: tp('gender'),
            value: t(`gender.${p.genderCode as 'female'}`),
            icon: User,
          },
        ]
      : []),
    ...(typeof p.ageYears === 'number'
      ? [
          {
            id: 'age',
            label: tp('age'),
            value: tp('age_value', { age: p.ageYears }),
            icon: CalendarDays,
          },
        ]
      : []),
    ...(p.classCode
      ? [
          {
            id: 'type',
            label: t('column.type'),
            value: typeLabel(p.classCode),
            icon: Users,
            showLabel: true,
          },
        ]
      : []),
  ];

  return (
    <Grid gap={4}>
      <DocumentTitle title={p.name} />
      <Breadcrumb
        items={[
          { id: 'list', label: tp('back'), href: '/admin/beneficiaries' },
          { id: 'profile', label: p.name },
        ]}
      />
      <ProfileHeader
        name={p.name}
        avatar={<HeaderAvatar name={p.name} fileId={p.photoFileId ?? null} />}
        status={
          <>
            <Badge
              variant="dot"
              tone={p.status === 'active' ? 'success' : 'warning'}
              label={t(`status.${p.status as 'active'}`)}
            />
            {p.isBlocked && <Badge variant="dot" tone="danger" label={t('blocked')} />}
          </>
        }
        facts={facts}
      />
      <div className="admin-profile-grid">
        <Grid gap={3}>
          <ProfileSection title={tp('sections.basic')} icon={User}>
            <DescriptionList
              columns={2}
              items={[
                ...optional('fatherOrHusbandName', t('column.father'), p.fatherOrHusbandName),
                ...optional('motherName', tp('mother'), p.motherName ?? empty),
                ...optional(
                  'genderCode',
                  tp('gender'),
                  p.genderCode ? t(`gender.${p.genderCode as 'female'}`) : empty,
                ),
                ...optional('ageYears', tp('age'), p.ageYears ?? empty),
                ...optional('classCode', t('column.type'), typeLabel(p.classCode)),
                ...optional('occupationCode', tp('occupation'), p.occupationCode ?? empty),
                ...optional('mobile', tp('mobile'), p.mobile),
                { label: tp('nid'), value: 'nid' in p ? (identity ?? empty) : hidden },
              ]}
            />
          </ProfileSection>

          <ProfileSection title={tp('sections.address')} icon={MapPin}>
            <DescriptionList
              columns={2}
              items={[
                { label: t('column.area'), value: <Area profile={p} /> },
                ...optional('village', tp('village'), p.village),
                ...optional('postOffice', tp('post_office'), p.postOffice ?? empty),
                ...optional('landmark', tp('landmark'), p.landmark ?? empty),
              ]}
            />
          </ProfileSection>

          {p.familyMembers && (
            <ProfileSection title={tp('sections.family')} icon={Users}>
              {p.familyMembers.length === 0 ? (
                none
              ) : (
                <Grid gap={1} as="ul" role="list">
                  {p.familyMembers.map((m) => (
                    <li key={m.id}>{m.name}</li>
                  ))}
                </Grid>
              )}
            </ProfileSection>
          )}

          {p.applications && (
            <ProfileSection title={tp('sections.applications')} icon={ClipboardList}>
              {p.applications.length === 0 ? (
                none
              ) : (
                <Grid gap={2} as="ul" role="list">
                  {p.applications.map((a) => (
                    <Stack direction="row" wrap gap={2} as="li" key={a.id}>
                      <strong>{a.appNo ?? projectName.get(a.projectId) ?? ''}</strong>
                      <span>{projectName.get(a.projectId)}</span>
                      <span className="admin-muted">
                        {a.submittedAt ? formatDate(a.submittedAt) : empty}
                      </span>
                    </Stack>
                  ))}
                </Grid>
              )}
            </ProfileSection>
          )}

          <ProfileSection title={tp('sections.distributions')} icon={Package}>
            {p.distributions.length === 0 ? (
              none
            ) : (
              <Grid gap={2} as="ul" role="list">
                {p.distributions.map((d) => (
                  <li key={d.id}>
                    {projectName.get(d.projectId) ?? ''} · {formatDate(d.doneAt)}
                  </li>
                ))}
              </Grid>
            )}
          </ProfileSection>

          {p.dawah && (
            <ProfileSection title={tp('sections.dawah')} icon={BookOpen}>
              {p.dawah.attendance.length + p.dawah.exams.length === 0 ? (
                none
              ) : (
                <Grid gap={1} as="ul" role="list">
                  <li>
                    {tp('attendance', {
                      present: p.dawah.attendance.filter((a) => a.present).length,
                      total: p.dawah.attendance.length,
                    })}
                  </li>
                  <li>
                    {tp('exams', {
                      passed: p.dawah.exams.filter((e) => e.passed).length,
                      total: p.dawah.exams.length,
                    })}
                  </li>
                </Grid>
              )}
            </ProfileSection>
          )}

          {p.followUps && (
            <ProfileSection title={tp('sections.followups')} icon={PhoneCall}>
              {p.followUps.calls.length + p.followUps.evaluations.length === 0 ? (
                none
              ) : (
                <DescriptionList
                  items={[
                    { label: tp('calls'), value: p.followUps.calls.length },
                    { label: tp('evaluations'), value: p.followUps.evaluations.length },
                  ]}
                />
              )}
            </ProfileSection>
          )}
        </Grid>

        <Grid gap={3} as="aside">
          {p.mobile && (
            <ProfileSection title={tp('contact')} icon={Phone}>
              <ContactList
                items={[
                  {
                    id: 'mobile',
                    icon: Phone,
                    label: tp('mobile'),
                    value: p.mobile,
                    href: telLink(p.mobile),
                    actionLabel: tp('call'),
                    copy: true,
                  },
                ]}
              />
            </ProfileSection>
          )}

          <ProfileSection title={tp('sections.projects')} icon={Briefcase}>
            {p.projectsByYear.length === 0 ? (
              none
            ) : (
              <Grid gap={2} as="ul" role="list">
                {p.projectsByYear.map((y) => (
                  <li key={y.year}>
                    <strong>{y.year}</strong>: {y.projects.map(nameOf).join(', ')}
                  </li>
                ))}
              </Grid>
            )}
          </ProfileSection>

          {p.activities && (
            <ProfileSection title={tp('sections.activities')} icon={History}>
              {p.activities.length === 0 ? (
                none
              ) : (
                <Timeline
                  label={tp('sections.activities')}
                  steps={p.activities.map((a) => ({
                    id: a.id,
                    title: projectName.get(a.projectId) ?? '',
                    time: formatDate(a.doneAt),
                    status: 'done' as const,
                  }))}
                />
              )}
            </ProfileSection>
          )}
        </Grid>
      </div>
    </Grid>
  );
}

function HeaderAvatar({ name, fileId }: { name: string; fileId: string | null }) {
  const photo = useFileDataUrl(fileId);
  return <Avatar name={name} letters={1} size="lg" src={photo.data ?? undefined} />;
}

/** The union (when sent), the upazila, the district and the division of the beneficiary. */
function Area({ profile: p }: { profile: BeneficiaryProfile }) {
  const locale = useLocale() as Locale;
  const names = [
    useLocationName(p.upazilaId, p.unionId ?? null),
    useLocationName(p.districtId, p.upazilaId),
    useLocationName(p.divisionId, p.districtId),
    useLocationName(undefined, p.divisionId),
  ];
  return (
    <>
      {names
        .map((n) => n?.[locale])
        .filter(Boolean)
        .join(', ')}
    </>
  );
}
