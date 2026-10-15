import { formatDate } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Alert, Badge, EmptyState, ErrorState, Skeleton } from '@css/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserX } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { AddressNames } from '../../components/AddressNames';
import { DocumentTitle } from '../../components/DocumentTitle';
import { FileImage } from '../../components/FileImage';
import {
  EducationText,
  PermanentAddressText,
  ProfessionText,
  SkillsText,
} from '../../features/account/DetailValues';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { BlocklistAction } from '../registrations/Blocklist';
import { RegistrationReview } from '../registrations/RegistrationDetail';
import { canSeeVolunteers } from '../roles';
import {
  profileKey,
  type VolunteerProfile,
  volunteerProfile,
  VOLUNTEERS_KEY,
} from './volunteers-api';
import { VolunteerSessions } from './VolunteerSessions';

/**
 * One volunteer for an official (SCR-043; DECISION_LOG O-67, D-094). A pending registration the
 * caller may decide on opens as the registration review (approve, correct, reject); every other
 * volunteer opens as the profile by section. The server sends only what the caller may see (an
 * absent NID or bank detail is "not shown to you", never empty) and says which actions the caller
 * may take; a button appears only for those.
 */
export function VolunteerProfilePage() {
  const { me } = useAuth();
  const { volunteerId = '' } = useParams();
  const t = useTranslations('admin.volunteers.profile');
  const tc = useTranslations('common');
  const profile = useQuery({
    queryKey: profileKey(volunteerId),
    queryFn: () => volunteerProfile(volunteerId),
    retry: false,
    // a caller without the tab is shown the refusal without asking the server
    enabled: !!me && canSeeVolunteers(me),
  });
  if (!me) return null;
  if (!canSeeVolunteers(me)) return <ForbiddenContent />;
  const back = (
    <div>
      <Link to="/admin/volunteers">{t('back')}</Link>
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
  const p = profile.data;
  const reviewing = p.state === 'pending' && (p.actions.approve || p.actions.requestCorrection);
  return (
    <>
      {back}
      {reviewing ? (
        <RegistrationReview
          userId={p.userId}
          finishedTo="/admin/volunteers?state=pending"
          allowed={p.actions}
        />
      ) : (
        <Profile profile={p} />
      )}
    </>
  );
}

function Profile({ profile: p }: { profile: VolunteerProfile }) {
  const t = useTranslations('admin.volunteers.profile');
  const tv = useTranslations('admin.volunteers');
  const tf = useTranslations('registration');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const empty = tf('profile.empty');
  const hidden = t('hidden');
  const changed = (message: string) => {
    setNotice(message);
    void queryClient.invalidateQueries({ queryKey: VOLUNTEERS_KEY });
  };
  const rows = (items: [string, ReactNode][]) => (
    <dl className="grid gap-2 sm:grid-cols-[12rem_1fr]">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="font-bold">{label}</dt>
          <dd className="m-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
  const photos: [string, string | null | undefined, boolean][] = [
    [tf('form.photo'), p.photoFileId, true],
    [tf('form.nid_photo'), p.nidPhotoFileId, 'nidPhotoFileId' in p],
    [tf('form.nid_photo_back'), p.nidPhotoBackFileId, 'nidPhotoBackFileId' in p],
  ];
  return (
    <>
      <DocumentTitle title={p.displayName} />
      <h1 className="admin-title">{p.displayName}</h1>
      <div className="admin-badges">
        <Badge label={tf(`form.types.${p.type}`)} />
        <Badge
          tone={p.state === 'active' ? 'success' : p.state === 'pending' ? 'info' : 'warning'}
          label={tv(`state.${p.state}`)}
        />
        {p.blocklist.blocked && <Badge tone="danger" label={tv('blocklisted')} />}
      </div>
      {notice && (
        <Alert tone="success" live="status" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <Section title={t('sections.identity')}>
        {rows([
          [tf('form.father_name'), p.fatherName],
          [tf('form.mother_name'), p.motherName],
          [tf('form.nid'), p.nid ?? hidden],
          [
            tf('form.date_of_birth'),
            p.dateOfBirth === undefined
              ? hidden
              : p.dateOfBirth
                ? formatDate(p.dateOfBirth)
                : empty,
          ],
          [tf('form.blood_group'), p.bloodGroup === undefined ? hidden : (p.bloodGroup ?? empty)],
          [tf('form.mobile'), p.mobile ?? empty],
          [tf('form.email'), p.email ?? empty],
          [tf('form.whatsapp'), p.whatsapp ?? empty],
          [tf('form.facebook'), p.facebookId ?? empty],
          [t('registered'), formatDate(p.registeredAt)],
          [t('approved'), p.approvedAt ? formatDate(p.approvedAt) : empty],
        ])}
      </Section>

      <Section title={t('sections.address')}>
        {rows([
          [tf('form.address'), <AddressNames key="address" address={p} />],
          [tf('form.address_line'), p.addressLine ?? empty],
          [
            tf('form.address_permanent'),
            <PermanentAddressText key="permanent" address={p.permanentAddress} />,
          ],
        ])}
      </Section>

      <Section title={t('sections.education')}>
        {rows([
          [
            tf('form.education_group'),
            <EducationText key="education" education={p.educationDetails} />,
          ],
          ...(p.education ? [[tf('form.education'), p.education] as [string, ReactNode]] : []),
        ])}
      </Section>

      <Section title={t('sections.work')}>
        {rows([
          [
            tf('form.profession_group'),
            <ProfessionText
              key="profession"
              profession={p.profession}
              details={p.professionDetails}
            />,
          ],
          ...(p.experience ? [[tf('form.experience'), p.experience] as [string, ReactNode]] : []),
          ...(p.workDescription
            ? [[tf('form.work_description'), p.workDescription] as [string, ReactNode]]
            : []),
          ...(p.previousProjects
            ? [[tf('form.previous_projects'), p.previousProjects] as [string, ReactNode]]
            : []),
        ])}
      </Section>

      <Section title={t('sections.skills')}>
        <SkillsText
          interestAreas={p.interestAreas}
          vehicle={p.vehicle}
          canSwim={p.canSwim}
          availability={p.availability}
          emergencyFullTime={p.emergencyFullTime}
        />
      </Section>

      <Section title={t('sections.bank')}>
        {p.bank
          ? rows([
              [tf('form.bank_name'), p.bank.bankName ?? empty],
              [tf('form.account_name'), p.bank.accountName ?? empty],
              [tf('form.account_number'), p.bank.accountNumber ?? empty],
              [tf('form.branch_name'), p.bank.branchName ?? empty],
              [tf('form.routing_number'), p.bank.routingNumber ?? empty],
            ])
          : hidden}
      </Section>

      <Section title={t('sections.photos')}>
        <div className="admin-photos">
          {photos.map(([label, fileId, visible]) => (
            <figure key={label} className="m-0 grid gap-1">
              <figcaption className="font-bold">{label}</figcaption>
              {!visible ? (
                <span>{hidden}</span>
              ) : fileId ? (
                <FileImage fileId={fileId} alt={label} />
              ) : (
                <span>{empty}</span>
              )}
            </figure>
          ))}
        </div>
      </Section>

      <Section title={t('sections.projects')}>
        {p.projects.length === 0 ? (
          <p className="admin-muted m-0">{t('no_projects')}</p>
        ) : (
          <ul className="m-0 grid gap-2 p-0" role="list">
            {p.projects.map((project) => (
              <li key={project.id} className="flex flex-wrap items-center gap-2">
                <strong>{locale === 'en' ? project.nameEn : project.nameBn}</strong>
                <span className="admin-muted">{project.year}</span>
                <span>
                  {t('permission_set')}: {project.permissionSet}
                </span>
                {project.isPaid && <Badge tone="info" label={t('paid')} />}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('sections.team')}>
        {p.team.length === 0 ? (
          <p className="admin-muted m-0">{t('no_team')}</p>
        ) : (
          <ul className="m-0 grid gap-2 p-0" role="list">
            {p.team.map((m) => (
              <li key={m.id}>
                <Link to={`/admin/volunteers/${m.id}`}>{m.displayName}</Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('sections.summary')}>
        <p className="admin-muted m-0">{t('summary_later')}</p>
      </Section>

      {'category' in p && (
        <Section title={t('sections.ratings')}>
          {rows([
            [
              t('category'),
              [p.category, p.inactiveFlag ? t('inactive') : null].filter(Boolean).join(' · ') ||
                empty,
            ],
          ])}
          {p.ratings?.length === 0 && <p className="admin-muted m-0">{t('no_ratings')}</p>}
        </Section>
      )}

      <Section title={t('sections.blocklist')}>
        <div className="grid gap-2">
          <p className="m-0">
            {p.blocklist.blocked && p.blocklist.blockedAt
              ? t('blocked_since', { date: formatDate(p.blocklist.blockedAt) })
              : t('not_blocked')}
          </p>
          {p.blocklist.reason && (
            <p className="m-0">
              {t('reason')}: {p.blocklist.reason}
            </p>
          )}
          {(p.actions.block || p.actions.unblock) && (
            <div>
              <BlocklistAction
                volunteerId={p.id}
                name={p.displayName}
                blocked={p.blocklist.blocked}
                onDone={changed}
              />
            </div>
          )}
        </div>
      </Section>

      {p.actions.viewSessions && (
        <Section title={t('sections.sessions')}>
          <VolunteerSessions userId={p.userId} canRevoke={p.actions.revokeSessions} />
        </Section>
      )}
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
