import type { OwnStaffProfile } from '@css/shared/auth';
import { formatDateTime } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import {
  Avatar,
  Badge,
  Button,
  Card,
  DescriptionList,
  EmptyState,
  ErrorState,
  ProfileHeader as Banner,
  type ProfileFact,
  Skeleton,
} from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, FolderKanban, IdCard, KeyRound, MonitorSmartphone, Phone } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { useFileDataUrl } from '../../components/FileImage';
import { canSeeProjects } from '../../admin/roles';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ProfileNav } from './ProfileNav';
import { ProjectsWork } from './ProjectsWork';
import { OWN_WORK_KEY, ownProjectsWork, ownStaffProfile, STAFF_PROFILE_KEY } from './profile-api';

const SECTIONS = [
  { key: 'identity', icon: IdCard },
  { key: 'contact', icon: Phone },
  { key: 'projects', icon: FolderKanban },
] as const;
type Section = (typeof SECTIONS)[number]['key'];

const STATE_TONE = {
  pending: 'warning',
  active: 'success',
  blocked: 'danger',
  deactivated: 'neutral',
} as const;

/**
 * An official's own profile (docs/DECISION_LOG.md, the official's own profile of 2026-11-02;
 * docs/ui/SCREENS.md, SCR-006): the banner with the photo or the initial, then one section at a
 * time: who they are and where they work, how they are reached and their account, and the
 * projects they work on by year with the figures of their work.
 */
export function OfficialProfile() {
  const t = useTranslations('registration.profile');
  const tc = useTranslations('common');
  const profile = useQuery({ queryKey: STAFF_PROFILE_KEY, queryFn: ownStaffProfile, retry: false });
  const [current, setCurrent] = useState<Section>('identity');
  if (profile.isPending) return <Skeleton count={3} />;
  if (profile.error instanceof ApiFailure && profile.error.status === 404)
    return <EmptyState title={t('official.not_official')} />;
  if (profile.error || !profile.data)
    return (
      <ErrorState
        title={tc('state.error.text')}
        onRetry={() => void profile.refetch()}
        requestId={profile.error instanceof ApiFailure ? profile.error.requestId : undefined}
      />
    );
  const me = profile.data;
  return (
    <div className="profile">
      <OfficialBanner me={me} />
      <div className="profile-layout">
        <ProfileNav
          sections={SECTIONS.map((s) => ({
            key: s.key,
            icon: s.icon,
            title: t(`official.sections.${s.key}`),
          }))}
          current={current}
          waiting={new Set<Section>()}
          busy={false}
          onSelect={setCurrent}
        />
        <SectionCard title={t(`official.sections.${current}`)}>
          {current === 'identity' && <Identity me={me} />}
          {current === 'contact' && <Contact me={me} />}
          {current === 'projects' && <OwnProjects />}
        </SectionCard>
      </div>
    </div>
  );
}

function OfficialBanner({ me }: { me: OwnStaffProfile }) {
  const t = useTranslations('registration.profile');
  const ts = useTranslations('admin.staff');
  const photo = useFileDataUrl(me.photoFileId);
  const facts: ProfileFact[] = [
    ...(me.designation
      ? [
          {
            id: 'designation',
            label: ts('dialog.designation'),
            value: me.designation,
            icon: Briefcase,
          },
        ]
      : []),
    ...(me.jobId
      ? [
          {
            id: 'job',
            label: ts('column.job_id'),
            value: me.jobId,
            icon: IdCard,
            showLabel: true,
            copy: true,
          },
        ]
      : []),
  ];
  return (
    <Banner
      name={me.displayName}
      headingLevel={2}
      avatar={<Avatar name={me.displayName} src={photo.data} letters={1} size="lg" />}
      status={<Badge variant="dot" tone={STATE_TONE[me.state]} label={t(`state.${me.state}`)} />}
      facts={facts}
    />
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <Card>
      <section aria-labelledby={id} className="profile-section">
        <div className="profile-section-head">
          <h2 id={id} className="profile-section-title">
            {title}
          </h2>
        </div>
        {children}
      </section>
    </Card>
  );
}

function Identity({ me }: { me: OwnStaffProfile }) {
  const ts = useTranslations('admin.staff');
  const td = useTranslations('admin.staff.dialog');
  const none = useTranslations('registration.profile')('empty');
  const locale = useLocale() as Locale;
  return (
    <DescriptionList
      items={[
        { label: td('name'), value: me.displayName },
        {
          label: ts('column.job_id'),
          value: me.jobId ? <span lang="en">{me.jobId}</span> : ts('no_job_id'),
        },
        { label: td('designation'), value: me.designation ?? none },
        {
          label: td('role'),
          value: me.roles.length ? me.roles.map((r) => localized(r.name, locale)).join(', ') : none,
        },
        {
          label: td('affiliation'),
          value: me.affiliation ? ts(`affiliation.${me.affiliation}`) : none,
        },
        ...(me.affiliation && me.affiliation !== 'department'
          ? [
              {
                label: td(me.affiliation === 'foundation' ? 'unit_foundation' : 'unit_external'),
                value: me.affiliationUnit ?? none,
              },
            ]
          : []),
        { label: td('program'), value: me.program ? localized(me.program.name, locale) : none },
        {
          label: td('division'),
          value: me.division ? localized(me.division.name, locale) : none,
        },
        { label: td('supervisor'), value: me.supervisor?.name ?? none },
      ]}
    />
  );
}

function Contact({ me }: { me: OwnStaffProfile }) {
  const t = useTranslations('registration.profile');
  const td = useTranslations('admin.staff.dialog');
  const tp = useTranslations('admin.staff.profile');
  const locale = useLocale() as Locale;
  const none = t('empty');
  return (
    <>
      <DescriptionList
        items={[
          { label: td('mobile'), value: me.mobile ?? none },
          { label: td('email'), value: me.email ?? none },
          { label: tp('state'), value: t(`state.${me.state}`) },
          {
            label: tp('last_login'),
            value: me.lastLoginAt ? formatDateTime(me.lastLoginAt, locale) : tp('never'),
          },
        ]}
      />
      <div className="profile-links">
        <Button variant="secondary" size="sm" icon={KeyRound} href="/account/password">
          {t('official.password')}
        </Button>
        <Button variant="secondary" size="sm" icon={MonitorSmartphone} href="/account/sessions">
          {t('official.devices')}
        </Button>
      </div>
    </>
  );
}

function OwnProjects() {
  const { me } = useAuth();
  const work = useQuery({ queryKey: OWN_WORK_KEY, queryFn: ownProjectsWork });
  return <ProjectsWork query={work} own projectLinks={Boolean(me && canSeeProjects(me))} />;
}
