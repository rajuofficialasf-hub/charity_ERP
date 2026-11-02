import { formatBenNo } from '@css/shared/beneficiaries';
import { formatDate } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Alert,
  Avatar,
  Badge,
  Breadcrumb,
  Button,
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  BookOpen,
  Briefcase,
  CalendarDays,
  Clapperboard,
  ClipboardList,
  FileText,
  GitMerge,
  Hash,
  History,
  IdCard,
  MapPin,
  Package,
  PencilLine,
  PhoneCall,
  Phone,
  User,
  Users,
  UserX,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { useFileDataUrl } from '../../components/FileImage';
import { ApiFailure } from '../../lib/api';
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
} from './beneficiaries-api';
import { BeneficiaryArea } from './BeneficiaryArea';
import { ContactDialog } from './ContactDialog';
import { CorrectionDialog } from './CorrectionDialog';
import { RevertMergeAction } from './duplicates/RevertMergeAction';
import { ContactLog, Corrections, useFileKind } from './ProfileHistory';
import { MediaWorksSection } from '../../features/media/MediaWorksSection';
import { RecordPdfButton } from '../../features/exports/RecordPdfButton';

/**
 * The 360° profile of one beneficiary in the one profile layout: the header card with the key facts,
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
  const [dialog, setDialog] = useState<'contact' | 'correction' | null>(null);
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
  const none = <Text className="admin-muted">{tp('no_rows')}</Text>;
  // the NID or the birth registration number only for a caller who sees identity numbers
  const identity = 'nid' in p ? (p.nid ?? p.birthReg ?? null) : null;

  const facts: ProfileFact[] = [
    {
      id: 'ben',
      label: tp('ben'),
      value: formatBenNo(p.benNo),
      icon: IdCard,
      showLabel: true,
      copy: true,
    },
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

  const actions = (
    <>
      <RecordPdfButton kind="beneficiary_profile" id={p.id} />
      {a.editContact && (
        <Button variant="secondary" icon={PencilLine} onPress={() => setDialog('contact')}>
          {tp('edit_contact')}
        </Button>
      )}
      {a.requestCorrection && (
        <Button variant="secondary" icon={FileText} onPress={() => setDialog('correction')}>
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
  const hasActions = printable || a.editContact || a.requestCorrection || a.block || a.unblock;
  const showCorrections = p.corrections.length > 0 || a.requestCorrection || a.decideCorrection;

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
        <Alert tone="success" live="status" onDismiss={dismissNotice}>
          {notice}
        </Alert>
      )}
      {shared.map((w) => (
        <Alert key={w.code} tone="warning" live="status" onDismiss={() => setShared([])}>
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
      {dialog === 'correction' && (
        <CorrectionDialog
          profile={p}
          onClose={() => setDialog(null)}
          onDone={() => changed(tp('correction_sent'))}
        />
      )}
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
                { label: t('column.area'), value: <BeneficiaryArea profile={p} /> },
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
                  {p.applications.map((app) => (
                    <Stack direction="row" wrap gap={2} as="li" key={app.id}>
                      <strong>{app.appNo ?? projectName.get(app.projectId) ?? ''}</strong>
                      <span>{projectName.get(app.projectId)}</span>
                      <span className="admin-muted">
                        {app.submittedAt ? formatDate(app.submittedAt) : empty}
                      </span>
                      {app.throughMerge && <Badge size="sm" label={tp('through_merge')} />}
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

          {p.media && (
            <ProfileSection title={tm('title')} icon={Clapperboard}>
              <MediaWorksSection works={p.media} emptyText={tm('empty')} />
            </ProfileSection>
          )}

          {p.dawah && (
            <ProfileSection title={tp('sections.dawah')} icon={BookOpen}>
              {p.dawah.attendance.length + p.dawah.exams.length === 0 ? (
                none
              ) : (
                <Grid gap={1} as="ul" role="list">
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

          {p.files && (
            <ProfileSection title={tp('sections.files')} icon={FileText}>
              {p.files.length === 0 ? (
                none
              ) : (
                <Grid gap={1} as="ul" role="list">
                  {p.files.map((f) => (
                    <li key={f.fileId}>{fileKind(f.kind)}</li>
                  ))}
                </Grid>
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

          {showCorrections && (
            <Corrections requests={p.corrections} canDecide={a.decideCorrection} onDone={changed} />
          )}

          {p.contactLog && <ContactLog rows={p.contactLog} />}

          {p.blocks && (
            <ProfileSection title={tp('sections.blocks')} icon={Ban}>
              {p.blocks.length === 0 ? (
                none
              ) : (
                <Grid gap={2} as="ul" role="list">
                  {p.blocks.map((b) => (
                    <Grid gap={1} as="li" key={b.id}>
                      <Stack direction="row" wrap gap={2}>
                        <strong>{tp('blocked_on', { date: formatDate(b.blockedAt) })}</strong>
                        {b.active && <Badge variant="dot" tone="danger" label={t('blocked')} />}
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
                    </Grid>
                  ))}
                </Grid>
              )}
            </ProfileSection>
          )}

          {p.merges.length > 0 && (
            <ProfileSection title={tp('sections.merges')} icon={GitMerge}>
              <Grid gap={2} as="ul" role="list">
                {p.merges.map((m) => {
                  const line = tp(m.role === 'kept' ? 'merge_kept' : 'merge_merged', {
                    benNo: formatBenNo(m.otherBenNo),
                  });
                  return (
                    <Grid gap={1} as="li" key={m.id}>
                      <Stack direction="row" wrap gap={2}>
                        {m.otherId ? (
                          <Link to={`/admin/beneficiaries/${m.otherId}`}>{line}</Link>
                        ) : (
                          <span>{line}</span>
                        )}
                        {m.status === 'reverted' && (
                          <Badge variant="dot" tone="warning" label={tp('merge_reverted')} />
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
                    </Grid>
                  );
                })}
              </Grid>
            </ProfileSection>
          )}

          {p.activities && (
            <ProfileSection title={tp('sections.activities')} icon={History}>
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
        </Grid>
      </div>
    </Grid>
  );
}

function HeaderAvatar({ name, fileId }: { name: string; fileId: string | null }) {
  const photo = useFileDataUrl(fileId);
  return <Avatar name={name} letters={1} size="lg" src={photo.data ?? undefined} />;
}
