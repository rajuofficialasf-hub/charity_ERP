import { formatBenNo } from '@css/shared/beneficiaries';
import { formatDate } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Alert,
  Button,
  Chip,
  ContactList,
  DescriptionList,
  EmptyState,
  ProfileSection,
  Skeleton,
  Stack,
  Text,
  Timeline,
  type ProfileFact,
} from '@/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { NoDocumentChip, ThroughVolunteerChip } from '../../components/PersonMarks';
import { PersonBanner } from '../../components/PersonPhoto';
import { ApiFailure } from '../../api/client';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { telLink } from '../contact-links';
import { BlocklistAction } from '../registrations/Blocklist';
import { canPrintProfile, canSeeBeneficiaries } from '../roles';
import { useHandedNotice } from '../use-handed-notice';
import {
  BENEFICIARIES_KEY,
  BENEFICIARY_TYPES,
  type BeneficiaryProfile,
  beneficiaryProfile,
  type ContactSaved,
  MOBILE_OWNERS,
} from './beneficiaries-api';
import { BeneficiaryArea } from './BeneficiaryArea';
import { FamilySection } from './FamilySection';
import { HelpHistory } from './HelpHistory';
import { ContactDialog } from './ContactDialog';
import { CorrectionDialog } from './CorrectionDialog';
import { IdentityDialog } from './IdentityDialog';
import { RevertMergeAction } from './duplicates/RevertMergeAction';
import { ContactLog, Corrections, useFileKind } from './ProfileHistory';
import { MediaWorksSection } from '../../features/media/MediaWorksSection';
import { RecordPdfButton } from '../../features/exports/RecordPdfButton';
import { PageCrumbs } from '../../components/shell/breadcrumb';
import { LoadError } from '../../components/LoadError';

/**
 * The 360° profile of one beneficiary in the one profile layout: the header card with the key facts,
 * then the basic details and address, the family, how often the person was helped, the application
 * history, distribution and implementation, dawah and follow-ups beside the contact, the projects
 * by year and the activity history. Each section shows real data where it exists and an empty state otherwise; a section the
 * server left out (the limited views of the Media and Procurement Teams) is not shown at all, and a
 * value it left out is never a chip of the header.
 */
export function BeneficiaryProfilePage() {
  const { me } = useAuth();
  const { beneficiaryId = '' } = useParams();
  const t = useTranslations('admin.beneficiaries.profile');
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
        <EmptyState title={t('not_found')} />
      </>
    );
  if (profile.error || !profile.data)
    return (
      <>
        {back}
        <LoadError error={profile.error} onRetry={() => void profile.refetch()} />
      </>
    );
  return <Profile profile={profile.data.data} etag={profile.data.meta.etag} />;
}

function Profile({ profile: p, etag }: { profile: BeneficiaryProfile; etag: string }) {
  const t = useTranslations('admin.beneficiaries');
  const tp = useTranslations('admin.beneficiaries.profile');
  const tm = useTranslations('media.section');
  const tf = useTranslations('registration');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const { me } = useAuth();
  const printable = !!me && canPrintProfile(me);
  const fileKind = useFileKind();
  const [dialog, setDialog] = useState<'contact' | 'correction' | 'identity' | null>(null);
  const { notice, setNotice, dismiss: dismissNotice } = useHandedNotice();
  const [shared, setShared] = useState<ContactSaved['warnings']>([]);
  const changed = (message: string) => {
    setDialog(null);
    setNotice(message);
    void queryClient.invalidateQueries({ queryKey: BENEFICIARIES_KEY });
  };
  const contactSaved = (saved: ContactSaved) => {
    changed(tp('contact_saved'));
    setShared(saved.warnings);
  };
  const a = p.actions;
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
  // whose number the mobile is, in the list's words, with the owner's name when there is one
  const owner = p.mobileOwnerCode
    ? (MOBILE_OWNERS as readonly string[]).includes(p.mobileOwnerCode)
      ? t(`mobile_owner.${p.mobileOwnerCode as 'own'}`)
      : p.mobileOwnerCode
    : null;
  const ownerLine =
    owner && p.mobileOwnerName
      ? tp('mobile_owner_named', { owner, name: p.mobileOwnerName })
      : owner;
  // the name beside the person is named the father's or the husband's where the profile knows it
  const fatherLabel =
    p.guardianRelationCode === 'father'
      ? tp('father_name')
      : p.guardianRelationCode === 'husband'
        ? tp('husband_name')
        : t('column.father');
  const none = <p className="admin-muted">{tp('no_rows')}</p>;
  // the NID or the birth registration number only for a caller who sees identity numbers
  const identity = 'nid' in p ? (p.nid ?? p.birthReg ?? null) : null;

  const facts: ProfileFact[] = [
    {
      id: 'ben',
      label: tp('ben'),
      value: formatBenNo(p.benNo),
      icon: 'id-card' as const,
      showLabel: true,
      copy: true,
    },
    ...(identity
      ? [
          {
            id: 'id',
            label: tp('nid'),
            value: identity,
            icon: 'hash' as const,
            showLabel: true,
            copy: true,
          },
        ]
      : []),
    ...(p.mobile
      ? [{ id: 'mobile', label: tp('mobile'), value: p.mobile, icon: 'phone' as const, copy: true }]
      : []),
    ...(p.genderCode
      ? [
          {
            id: 'gender',
            label: tp('gender'),
            value: t(`gender.${p.genderCode as 'female'}`),
            icon: 'user' as const,
          },
        ]
      : []),
    ...(typeof p.ageYears === 'number'
      ? [
          {
            id: 'age',
            label: tp('age'),
            value: tp('age_value', { age: p.ageYears }),
            icon: 'calendar' as const,
          },
        ]
      : []),
    ...(p.classCode
      ? [
          {
            id: 'type',
            label: t('column.type'),
            value: typeLabel(p.classCode),
            icon: 'users' as const,
            showLabel: true,
          },
        ]
      : []),
  ];

  const actions = (
    <>
      <RecordPdfButton kind="beneficiary_profile" id={p.id} />
      {a.editContact && (
        <Button variant="secondary" startIcon="edit-line" onClick={() => setDialog('contact')}>
          {tp('edit_contact')}
        </Button>
      )}
      {a.addIdentity && (
        <Button variant="secondary" startIcon="id-card" onClick={() => setDialog('identity')}>
          {tp('add_identity')}
        </Button>
      )}
      {a.requestCorrection && (
        <Button variant="secondary" startIcon="file" onClick={() => setDialog('correction')}>
          {tp('request_correction')}
        </Button>
      )}
      {(a.block || a.unblock) && (
        <BlocklistAction
          danger
          beneficiaryId={p.id}
          name={p.name}
          blocked={a.unblock}
          onDone={changed}
        />
      )}
    </>
  );
  const hasActions =
    printable || a.editContact || a.addIdentity || a.requestCorrection || a.block || a.unblock;
  const showCorrections = p.corrections.length > 0 || a.requestCorrection || a.decideCorrection;

  return (
    <Stack gap={4}>
      <DocumentTitle title={p.name} />
      <PageCrumbs
        items={[
          { id: 'list', label: tp('back'), href: '/admin/beneficiaries' },
          { id: 'profile', label: p.name },
        ]}
      />
      <PersonBanner
        name={p.name}
        fileId={p.photoFileId}
        status={
          <>
            <Chip tone={p.status === 'active' ? 'success' : 'warning'}>
              {t(`status.${p.status as 'active'}`)}
            </Chip>
            {p.isBlocked && <Chip tone="error">{t('blocked')}</Chip>}
            {p.hasDocument === false && <NoDocumentChip />}
          </>
        }
        facts={facts}
        actions={hasActions ? actions : undefined}
        actionsLabel={tp('actions_label')}
      />
      {p.mergedInto && (
        <Alert
          tone="info"
          action={<Link to={`/admin/beneficiaries/${p.mergedInto.id}`}>{tp('merged_open')}</Link>}
        >
          {tp('merged_into', { benNo: formatBenNo(p.mergedInto.benNo) })}
        </Alert>
      )}
      {notice && (
        <Alert tone="success" onDismiss={dismissNotice}>
          {notice}
        </Alert>
      )}
      {shared.map((w) => (
        <Alert key={w.code} tone="warning" onDismiss={() => setShared([])}>
          {w.benNos.length
            ? tp('mobile_shared_list', { count: w.count, benNos: w.benNos.join(', ') })
            : tp('mobile_shared', { count: w.count })}
        </Alert>
      ))}
      {dialog === 'contact' && (
        <ContactDialog
          profile={p}
          etag={etag}
          onClose={() => setDialog(null)}
          onDone={contactSaved}
        />
      )}
      {dialog === 'identity' && (
        <IdentityDialog
          beneficiaryId={p.id}
          etag={etag}
          onClose={() => setDialog(null)}
          onDone={() => changed(tp('identity_added'))}
        />
      )}
      {dialog === 'correction' && (
        <CorrectionDialog
          profile={p}
          onClose={() => setDialog(null)}
          onDone={() => changed(tp('correction_sent'))}
        />
      )}
      <div className="admin-profile-grid">
        <Stack gap={3}>
          <ProfileSection title={tp('sections.basic')} icon="user">
            <DescriptionList
              columns={2}
              items={[
                ...optional('fatherOrHusbandName', fatherLabel, p.fatherOrHusbandName),
                ...optional('motherName', tp('mother'), p.motherName ?? empty),
                ...optional(
                  'genderCode',
                  tp('gender'),
                  p.genderCode ? t(`gender.${p.genderCode as 'female'}`) : empty,
                ),
                ...optional('ageYears', tp('age'), p.ageYears ?? empty),
                ...optional('classCode', t('column.type'), typeLabel(p.classCode)),
                ...optional('occupationCode', tp('occupation'), p.occupationCode ?? empty),
                ...optional('mobile', tp('mobile'), p.mobile ?? <ThroughVolunteerChip />),
                ...(ownerLine ? [{ label: tp('mobile_owner'), value: ownerLine }] : []),
                {
                  label: tp('nid'),
                  value:
                    p.hasDocument === false ? (
                      <NoDocumentChip />
                    ) : 'nid' in p ? (
                      (identity ?? empty)
                    ) : (
                      hidden
                    ),
                },
              ]}
            />
          </ProfileSection>

          <ProfileSection title={tp('sections.address')} icon="map-pin">
            <DescriptionList
              columns={2}
              items={[
                { label: t('column.area'), value: <BeneficiaryArea profile={p} /> },
                ...optional('village', tp('village'), p.village),
                ...optional('postOffice', tp('post_office'), p.postOffice ?? empty),
                ...optional('landmark', tp('landmark'), p.landmark ?? empty),
              ]}
            />
          </ProfileSection>

          {/* the household now, the families that hold the person, and what the family received:
              only where the profile knows a member or a family */}
          {((p.familyMembers?.length ?? 0) > 0 || (p.memberOf?.length ?? 0) > 0) && (
            <ProfileSection title={tp('sections.family')} icon="users">
              <FamilySection
                members={p.familyMembers ?? []}
                memberOf={p.memberOf ?? []}
                help={p.familyHelp}
              />
            </ProfileSection>
          )}

          {/* how often the person was helped, only with the application history class */}
          {p.help && (
            <ProfileSection title={tp('sections.help')} icon="hand-heart">
              <HelpHistory help={p.help} />
            </ProfileSection>
          )}

          {p.applications && (
            <ProfileSection title={tp('sections.applications')} icon="clipboard">
              {p.applications.length === 0 ? (
                none
              ) : (
                <ul className="admin-plain-list">
                  {p.applications.map((app) => (
                    <li key={app.id}>
                      <Stack direction="row" wrap gap={2}>
                        <strong>{app.appNo ?? projectName.get(app.projectId) ?? ''}</strong>
                        <span>{projectName.get(app.projectId)}</span>
                        <span className="admin-muted">
                          {app.submittedAt ? formatDate(app.submittedAt) : empty}
                        </span>
                        {app.throughMerge && <Chip>{tp('through_merge')}</Chip>}
                      </Stack>
                    </li>
                  ))}
                </ul>
              )}
            </ProfileSection>
          )}

          <ProfileSection title={tp('sections.distributions')} icon="package">
            {p.distributions.length === 0 ? (
              none
            ) : (
              <ul className="admin-plain-list">
                {p.distributions.map((d) => (
                  <li key={d.id}>
                    {projectName.get(d.projectId) ?? ''} · {formatDate(d.doneAt)}
                  </li>
                ))}
              </ul>
            )}
          </ProfileSection>

          {p.media && (
            <ProfileSection title={tm('title')} icon="video">
              <MediaWorksSection works={p.media} emptyText={tm('empty')} />
            </ProfileSection>
          )}

          {p.dawah && (
            <ProfileSection title={tp('sections.dawah')} icon="book">
              {p.dawah.attendance.length + p.dawah.exams.length === 0 ? (
                none
              ) : (
                <ul className="admin-plain-list">
                  <li>
                    {tp('attendance', {
                      present: p.dawah.attendance.filter((x) => x.present).length,
                      total: p.dawah.attendance.length,
                    })}
                  </li>
                  <li>
                    {tp('exams', {
                      passed: p.dawah.exams.filter((e) => e.passed).length,
                      total: p.dawah.exams.length,
                    })}
                  </li>
                </ul>
              )}
            </ProfileSection>
          )}

          {p.followUps && (
            <ProfileSection title={tp('sections.followups')} icon="phone-call">
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

          {p.files && (
            <ProfileSection title={tp('sections.files')} icon="file">
              {p.files.length === 0 ? (
                none
              ) : (
                <ul className="admin-plain-list">
                  {p.files.map((f) => (
                    <li key={f.fileId}>{fileKind(f.kind)}</li>
                  ))}
                </ul>
              )}
            </ProfileSection>
          )}
        </Stack>

        <aside className="admin-profile-side">
          {p.mobile === null && (
            <ProfileSection title={tp('contact')} icon="phone">
              <ThroughVolunteerChip />
            </ProfileSection>
          )}
          {p.mobile && (
            <ProfileSection title={tp('contact')} icon="phone">
              <ContactList
                items={[
                  {
                    id: 'mobile',
                    icon: 'phone' as const,
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

          <ProfileSection title={tp('sections.projects')} icon="briefcase">
            {p.projectsByYear.length === 0 ? (
              none
            ) : (
              <ul className="admin-plain-list">
                {p.projectsByYear.map((y) => (
                  <li key={y.year}>
                    <strong>{y.year}</strong>: {y.projects.map(nameOf).join(', ')}
                  </li>
                ))}
              </ul>
            )}
          </ProfileSection>

          {showCorrections && (
            <Corrections requests={p.corrections} canDecide={a.decideCorrection} onDone={changed} />
          )}

          {p.contactLog && <ContactLog rows={p.contactLog} />}

          {p.blocks && (
            <ProfileSection title={tp('sections.blocks')} icon="block">
              {p.blocks.length === 0 ? (
                none
              ) : (
                <ul className="admin-plain-list">
                  {p.blocks.map((b) => (
                    <li className="admin-plain-item" key={b.id}>
                      <Stack direction="row" wrap gap={2}>
                        <strong>{tp('blocked_on', { date: formatDate(b.blockedAt) })}</strong>
                        {b.active && <Chip tone="error">{t('blocked')}</Chip>}
                      </Stack>
                      <Text tone="muted">{tp('reason', { reason: b.reason })}</Text>
                      {b.releasedAt && (
                        <Text tone="muted">
                          {tp('released_on', {
                            date: formatDate(b.releasedAt),
                            reason: b.releaseReason ?? empty,
                          })}
                        </Text>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </ProfileSection>
          )}

          {p.merges.length > 0 && (
            <ProfileSection title={tp('sections.merges')} icon="merge">
              <ul className="admin-plain-list">
                {p.merges.map((m) => {
                  const line = tp(m.role === 'kept' ? 'merge_kept' : 'merge_merged', {
                    benNo: formatBenNo(m.otherBenNo),
                  });
                  return (
                    <li className="admin-plain-item" key={m.id}>
                      <Stack direction="row" wrap gap={2}>
                        {m.otherId ? (
                          <Link to={`/admin/beneficiaries/${m.otherId}`}>{line}</Link>
                        ) : (
                          <span>{line}</span>
                        )}
                        {m.status === 'reverted' && (
                          <Chip tone="warning">{tp('merge_reverted')}</Chip>
                        )}
                      </Stack>
                      {m.status === 'merged' && a.revertMerge && (
                        <div>
                          <RevertMergeAction
                            mergeId={m.id}
                            benNo={formatBenNo(m.otherBenNo)}
                            onDone={changed}
                          />
                        </div>
                      )}
                      <Text tone="muted">
                        {[
                          m.mergedAt && formatDate(m.mergedAt),
                          m.leftBehind > 0 && tp('left_behind', { count: m.leftBehind }),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </li>
                  );
                })}
              </ul>
            </ProfileSection>
          )}

          {p.activities && (
            <ProfileSection title={tp('sections.activities')} icon="history">
              {p.activities.length === 0 ? (
                none
              ) : (
                <Timeline
                  label={tp('sections.activities')}
                  steps={p.activities.map((act) => ({
                    id: act.id,
                    title: projectName.get(act.projectId) ?? '',
                    time: formatDate(act.doneAt),
                    status: 'done' as const,
                  }))}
                />
              )}
            </ProfileSection>
          )}
        </aside>
      </div>
    </Stack>
  );
}
