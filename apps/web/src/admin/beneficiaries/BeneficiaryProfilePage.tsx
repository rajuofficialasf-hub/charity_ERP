import { formatDate } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Badge,
  DescriptionList,
  EmptyState,
  ErrorState,
  Grid,
  Skeleton,
  Stack,
  Text,
} from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { UserX } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { Link, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { useLocationName } from '../../components/AddressNames';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canSeeBeneficiaries } from '../roles';
import {
  BENEFICIARIES_KEY,
  BENEFICIARY_TYPES,
  type BeneficiaryProfile,
  beneficiaryProfile,
} from './beneficiaries-api';

/**
 * The 360° profile of one beneficiary (SCR-045 shell; DECISION_LOG O-67, D-094): the basic details
 * and address, the projects by year, the application history, distribution and implementation,
 * dawah, follow-ups and the activity history. Each section shows real data where it exists and an
 * empty state otherwise; a section the server left out (the limited views of the Media and
 * Procurement Teams) is not shown at all.
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
  return (
    <>
      {back}
      <Profile profile={profile.data} />
    </>
  );
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
    key in p ? [[label, value] as [string, ReactNode]] : [];
  const none = <Text className="admin-muted">{tp('no_rows')}</Text>;
  return (
    <>
      <DocumentTitle title={p.name} />
      <h1 className="admin-title">{p.name}</h1>
      <div className="admin-badges">
        <Badge
          tone={p.status === 'active' ? 'success' : 'warning'}
          label={t(`status.${p.status as 'active'}`)}
        />
        {p.isBlocked && <Badge tone="danger" label={t('blocked')} />}
      </div>

      <Section title={tp('sections.basic')}>
        <Rows
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
            [tp('nid'), 'nid' in p ? (p.nid ?? p.birthReg ?? empty) : hidden],
          ]}
        />
      </Section>

      <Section title={tp('sections.address')}>
        <Rows
          items={[
            [t('column.area'), <Area key="area" profile={p} />],
            ...optional('village', tp('village'), p.village),
            ...optional('postOffice', tp('post_office'), p.postOffice ?? empty),
            ...optional('landmark', tp('landmark'), p.landmark ?? empty),
          ]}
        />
      </Section>

      {p.familyMembers && (
        <Section title={tp('sections.family')}>
          {p.familyMembers.length === 0 ? (
            none
          ) : (
            <Grid gap={1} as="ul" role="list">
              {p.familyMembers.map((m) => (
                <li key={m.id}>{m.name}</li>
              ))}
            </Grid>
          )}
        </Section>
      )}

      <Section title={tp('sections.projects')}>
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
      </Section>

      {p.applications && (
        <Section title={tp('sections.applications')}>
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
        </Section>
      )}

      <Section title={tp('sections.distributions')}>
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
      </Section>

      {p.dawah && (
        <Section title={tp('sections.dawah')}>
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
        </Section>
      )}

      {p.followUps && (
        <Section title={tp('sections.followups')}>
          {p.followUps.calls.length + p.followUps.evaluations.length === 0 ? (
            none
          ) : (
            <Rows
              items={[
                [tp('calls'), p.followUps.calls.length],
                [tp('evaluations'), p.followUps.evaluations.length],
              ]}
            />
          )}
        </Section>
      )}

      {p.activities && (
        <Section title={tp('sections.activities')}>
          {p.activities.length === 0 ? (
            none
          ) : (
            <Grid gap={1} as="ul" role="list">
              {p.activities.map((a) => (
                <li key={a.id}>
                  {projectName.get(a.projectId) ?? ''} · {formatDate(a.doneAt)}
                </li>
              ))}
            </Grid>
          )}
        </Section>
      )}
    </>
  );
}

function Rows({ items }: { items: [string, ReactNode][] }) {
  return <DescriptionList items={items.map(([label, value]) => ({ label, value }))} />;
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="admin-panel-section">
      <h2 id={id} className="admin-subtitle">
        {title}
      </h2>
      {children}
    </section>
  );
}
