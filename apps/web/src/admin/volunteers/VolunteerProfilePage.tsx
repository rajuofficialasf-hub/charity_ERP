import { formatDate, formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Alert,
  Avatar,
  Badge,
  type ContactItem,
  ContactList,
  DescriptionList,
  EmptyState,
  ErrorState,
  Grid,
  Modal,
  type ProfileFact,
  ProfileHeader,
  ProfileSection,
  Skeleton,
  Stack,
  Tabs,
  Text,
  Timeline,
  type TimelineStep,
} from '@css/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Briefcase,
  CalendarDays,
  Droplet,
  Globe,
  GraduationCap,
  Hash,
  Images,
  Landmark,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  User,
  UserX,
  ZoomIn,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { AddressNames } from '../../components/AddressNames';
import { DocumentTitle } from '../../components/DocumentTitle';
import { FileImage, useFileDataUrl } from '../../components/FileImage';
import {
  EducationText,
  PermanentAddressText,
  ProfessionText,
  SkillsText,
} from '../../features/account/DetailValues';
import { FIELD_LABEL, type RequestField } from '../../features/account/profile-api';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { BlocklistAction } from '../registrations/Blocklist';
import {
  detailKey,
  LIST_KEY,
  registrationDetail,
  type RegistrationDetailView,
} from '../registrations/registrations-api';
import { VolunteerDecisions } from '../registrations/VolunteerDecisions';
import { mailLink, telLink } from '../contact-links';
import { canSeeVolunteers, canTransferApplications } from '../roles';
import {
  profileKey,
  type VolunteerProfile,
  volunteerProfile,
  VOLUNTEERS_KEY,
} from './volunteers-api';
import { VolunteerSessions } from './VolunteerSessions';
import { PageCrumbs } from '../../components/shell/breadcrumb';

/**
 * One volunteer for an official in the one profile layout: the header card with the key facts, the
 * documents and the actions, then the profile by tab. A pending registration the caller decides on
 * opens in the same layout with the decisions (approve, ask for a correction, reject) and its
 * correction requests. The server sends only what the caller may see (an absent NID or bank detail
 * is "not shown to you", never empty, and never a chip) and says which actions the caller may take;
 * a button appears only for those.
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
  return p.state === 'pending' && p.actions.review ? (
    <PendingProfile profile={p} />
  ) : (
    <Profile profile={p} />
  );
}

/** A pending registration the caller decides on: the registration's details and its corrections. */
function PendingProfile({ profile: p }: { profile: VolunteerProfile }) {
  const t = useTranslations('admin.registrations');
  const tc = useTranslations('common');
  const reg = useQuery({
    queryKey: detailKey(p.userId),
    queryFn: () => registrationDetail(p.userId),
    retry: false,
  });
  if (reg.isPending) return <Skeleton count={4} />;
  if (reg.error instanceof ApiFailure && reg.error.status === 404)
    return <EmptyState icon={UserX} title={t('not_found')} />;
  if (reg.error || !reg.data)
    // the profile still shows (and its block and devices); the decisions wait for the registration
    return (
      <Grid gap={3}>
        <ErrorState
          title={tc('state.error.text')}
          requestId={reg.error instanceof ApiFailure ? reg.error.requestId : undefined}
          onRetry={() => void reg.refetch()}
        />
        <Profile profile={p} />
      </Grid>
    );
  return <Profile profile={p} registration={reg.data} />;
}

type View = VolunteerProfile & { volunteeringArea: string | null; tshirtSize: string | null };

/** The registration's answers over the profile's, so the review shows what was submitted. */
function merged(p: VolunteerProfile, r?: RegistrationDetailView): View {
  if (!r?.volunteer) return p;
  const { referenceVolunteerId: _reference, ...answers } = r.volunteer;
  return {
    ...p,
    ...answers,
    id: p.id,
    type: p.type,
    mobile: r.mobile,
    email: r.email,
    registeredAt: r.submittedAt,
  } as View;
}

function Profile({
  profile,
  registration,
}: {
  profile: VolunteerProfile;
  registration?: RegistrationDetailView;
}) {
  const t = useTranslations('admin.volunteers.profile');
  const tv = useTranslations('admin.volunteers');
  const tr = useTranslations('admin.registrations');
  const tf = useTranslations('registration');
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [notice, setNotice] = useState<string | null>(null);
  const p = merged(profile, registration);
  const changed = (message: string) => {
    setNotice(message);
    void queryClient.invalidateQueries({ queryKey: VOLUNTEERS_KEY });
    // a block or a correction changes the pending registration and its list too
    void queryClient.invalidateQueries({ queryKey: detailKey(p.userId) });
    void queryClient.invalidateQueries({ queryKey: LIST_KEY });
  };
  const pending = registration !== undefined;
  const inCorrection = registration?.status === 'in_correction';
  const blocked = registration ? registration.blocklisted : p.blocklist.blocked;

  const facts: ProfileFact[] = [
    ...(p.nid
      ? [
          {
            id: 'nid',
            label: tf('form.nid'),
            value: p.nid,
            icon: Hash,
            showLabel: true,
            copy: true,
          },
        ]
      : []),
    ...(p.mobile
      ? [{ id: 'mobile', label: tf('form.mobile'), value: p.mobile, icon: Phone, copy: true }]
      : []),
  ];

  const status = (
    <>
      <Badge label={tf(`form.types.${p.type}`)} />
      {pending ? (
        <Badge
          variant="dot"
          tone="warning"
          label={tr(`status.${inCorrection ? 'in_correction' : 'awaiting_review'}`)}
        />
      ) : (
        <Badge
          variant="dot"
          tone={p.state === 'active' ? 'success' : p.state === 'pending' ? 'info' : 'warning'}
          label={tv(`state.${p.state}`)}
        />
      )}
      {blocked && <Badge variant="dot" tone="danger" label={tv('blocklisted')} />}
    </>
  );

  const actions = (
    <>
      {registration && (
        <VolunteerDecisions
          userId={p.userId}
          name={p.displayName}
          inCorrection={inCorrection}
          blocklisted={registration.blocklisted}
          allowed={p.actions}
          finishedTo="/admin/volunteers?state=pending"
          onChanged={changed}
        />
      )}
      {(p.actions.block || p.actions.unblock) && (
        <BlocklistAction
          danger
          volunteerId={p.id}
          name={p.displayName}
          blocked={blocked}
          onDone={changed}
        />
      )}
    </>
  );
  const hasActions = Boolean(registration) || p.actions.block || p.actions.unblock;

  const tabs = [
    {
      id: 'info',
      label: t('tabs.info'),
      content: <InfoTab view={p} registration={registration} />,
    },
    { id: 'documents', label: t('tabs.documents'), content: <DocumentsTab view={p} /> },
    { id: 'work', label: t('tabs.work'), content: <WorkTab view={p} /> },
    {
      id: 'history',
      label: t('tabs.history'),
      content: <HistoryTab view={p} registration={registration} />,
    },
    ...(p.actions.viewSessions
      ? [
          {
            id: 'devices',
            label: t('tabs.devices'),
            content: <VolunteerSessions userId={p.userId} canRevoke={p.actions.revokeSessions} />,
          },
        ]
      : []),
  ];
  const selected = tabs.find((tab) => tab.id === params.get('tab'))?.id ?? 'info';

  return (
    <Grid gap={4}>
      <DocumentTitle title={p.displayName} />
      <PageCrumbs
        items={[
          {
            id: 'list',
            label: t('back'),
            href: pending ? '/admin/volunteers?state=pending' : '/admin/volunteers',
          },
          { id: 'profile', label: p.displayName },
        ]}
      />
      <ProfileHeader
        name={p.displayName}
        avatar={<HeaderAvatar name={p.displayName} fileId={p.photoFileId} />}
        status={status}
        facts={facts}
        actions={hasActions ? actions : undefined}
        actionsLabel={t('actions_label')}
      />
      {notice && (
        <Alert tone="success" live="status" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {pending && registration?.blocklisted && <Alert tone="danger">{tr('blocklisted')}</Alert>}
      <Tabs
        label={t('tabs_label')}
        items={tabs}
        selectedId={selected}
        onChange={(id) =>
          setParams(
            (current) => {
              const next = new URLSearchParams(current);
              if (id === 'info') next.delete('tab');
              else next.set('tab', id);
              return next;
            },
            { replace: true },
          )
        }
      />
    </Grid>
  );
}

function HeaderAvatar({ name, fileId }: { name: string; fileId: string | null }) {
  const photo = useFileDataUrl(fileId);
  return <Avatar name={name} letters={1} size="lg" src={photo.data ?? undefined} />;
}

interface DocumentSlot {
  id: string;
  label: string;
  fileId: string | null | undefined;
  /** False when the server left the file out for this caller (the NID pages). */
  visible: boolean;
}

/** The photo and the NID pages; the NID pages are visible only with the identity class. */
function useDocumentSlots(view: View): DocumentSlot[] {
  const tf = useTranslations('registration.form');
  return [
    { id: 'photo', label: tf('photo'), fileId: view.photoFileId, visible: true },
    {
      id: 'nid',
      label: tf('nid_photo'),
      fileId: view.nidPhotoFileId,
      visible: 'nidPhotoFileId' in view,
    },
    {
      id: 'nid_back',
      label: tf('nid_photo_back'),
      fileId: view.nidPhotoBackFileId,
      visible: 'nidPhotoBackFileId' in view,
    },
  ];
}

/** The documents at the top of the profile's side: a thumbnail each, opened larger in a dialog. */
function DocumentStrip({ view }: { view: View }) {
  const t = useTranslations('admin.volunteers.profile');
  const [open, setOpen] = useState<{ label: string; fileId: string } | null>(null);
  const slots = useDocumentSlots(view).filter((slot) => slot.visible);
  return (
    <ProfileSection title={t('documents_title', { count: slots.length })} icon={Images}>
      <ul className="admin-docs-list">
        {slots.map((slot) => (
          <li key={slot.id}>
            {slot.fileId ? (
              <Thumb
                fileId={slot.fileId}
                label={slot.label}
                onOpen={(fileId) => setOpen({ label: slot.label, fileId })}
              />
            ) : (
              <span className="admin-doc-thumb is-empty">{t('no_photo')}</span>
            )}
            <span className="admin-doc-label">{slot.label}</span>
          </li>
        ))}
      </ul>
      <Modal
        title={open?.label ?? ''}
        size="lg"
        isOpen={open !== null}
        onClose={() => setOpen(null)}
      >
        {open && <FileImage fileId={open.fileId} alt={open.label} />}
      </Modal>
    </ProfileSection>
  );
}

/** A document's thumbnail that opens it larger; a file that failed to load says so instead. */
function Thumb({
  fileId,
  label,
  onOpen,
}: {
  fileId: string;
  label: string;
  onOpen: (fileId: string) => void;
}) {
  const t = useTranslations('admin.volunteers.profile');
  const file = useFileDataUrl(fileId);
  if (file.error) return <span className="admin-doc-thumb is-empty">{t('photo_failed')}</span>;
  return (
    <button type="button" className="admin-doc-thumb" onClick={() => onOpen(fileId)}>
      {file.data ? <img src={file.data} alt="" /> : <Skeleton shape="card" />}
      <span className="admin-doc-zoom" aria-hidden="true">
        <ZoomIn size={16} />
      </span>
      <span className="ui-sr-only">{t('view_document', { name: label })}</span>
    </button>
  );
}

function InfoTab({ view: p, registration }: { view: View; registration?: RegistrationDetailView }) {
  const t = useTranslations('admin.volunteers.profile');
  const tf = useTranslations('registration');
  // a missing answer reads quieter than a given one
  const empty = <span className="admin-blank">{tf('profile.empty')}</span>;
  const hidden = t('hidden');
  const items = (rows: [string, ReactNode, typeof User?][]) =>
    rows.map(([label, value, icon]) => ({ label, value, icon }));
  const facebookUrl = p.facebookId && /^https?:\/\//i.test(p.facebookId) ? p.facebookId : null;
  const whatsappDigits = p.whatsapp?.replace(/\D/g, '');
  const contacts: ContactItem[] = [
    ...(p.mobile
      ? [
          {
            id: 'mobile',
            icon: Phone,
            label: tf('form.mobile'),
            value: p.mobile,
            href: telLink(p.mobile),
            actionLabel: t('call'),
            copy: true,
          },
        ]
      : []),
    ...(p.email
      ? [
          {
            id: 'email',
            icon: Mail,
            label: tf('form.email'),
            value: p.email,
            href: mailLink(p.email),
            actionLabel: t('send_email'),
            copy: true,
          },
        ]
      : []),
    ...(p.whatsapp && whatsappDigits
      ? [
          {
            id: 'whatsapp',
            icon: MessageCircle,
            label: tf('form.whatsapp'),
            value: p.whatsapp,
            // a Bangladeshi number without its country code gets one
            href: `https://wa.me/${whatsappDigits.startsWith('0') ? `88${whatsappDigits}` : whatsappDigits}`,
            actionLabel: t('open_whatsapp'),
            external: true,
          },
        ]
      : []),
    ...(p.facebookId
      ? [
          {
            id: 'facebook',
            icon: Globe,
            label: tf('form.facebook'),
            value: p.facebookId,
            ...(facebookUrl
              ? { href: facebookUrl, actionLabel: t('open_facebook'), external: true }
              : {}),
          },
        ]
      : []),
  ];
  return (
    <div className="admin-profile-grid">
      <Grid gap={3}>
        <ProfileSection title={t('personal')} icon={User}>
          <DescriptionList
            columns={2}
            items={items([
              [tf('form.father_name'), p.fatherName, User],
              [tf('form.mother_name'), p.motherName, User],
              [tf('form.nid'), p.nid ?? hidden, Hash],
              [
                tf('form.date_of_birth'),
                p.dateOfBirth === undefined
                  ? hidden
                  : p.dateOfBirth
                    ? formatDate(p.dateOfBirth)
                    : empty,
                CalendarDays,
              ],
              [
                tf('form.blood_group'),
                p.bloodGroup === undefined ? hidden : (p.bloodGroup ?? empty),
                Droplet,
              ],
              [tf('form.mobile'), p.mobile ?? empty, Phone],
              [tf('form.email'), p.email ?? empty, Mail],
              [tf('form.whatsapp'), p.whatsapp ?? empty, MessageCircle],
              [tf('form.facebook'), p.facebookId ?? empty, Globe],
              [
                tf('form.volunteering_area'),
                p.volunteeringArea
                  ? tf(`lists.volunteering_area.${p.volunteeringArea as 'anywhere'}`)
                  : empty,
                MapPin,
              ],
              [tf('form.tshirt_size'), p.tshirtSize ?? empty],
              [t('registered'), formatDate(p.registeredAt)],
              ...(registration
                ? []
                : [
                    [t('approved'), p.approvedAt ? formatDate(p.approvedAt) : empty] as [
                      string,
                      ReactNode,
                    ],
                  ]),
            ])}
          />
        </ProfileSection>
        <ProfileSection title={t('sections.address')} icon={MapPin}>
          <DescriptionList
            items={[
              { label: tf('form.address'), value: <AddressNames address={p} /> },
              { label: tf('form.address_line'), value: p.addressLine ?? empty },
              {
                label: tf('form.address_permanent'),
                value: <PermanentAddressText address={p.permanentAddress} />,
              },
            ]}
          />
        </ProfileSection>
        <ProfileSection title={t('education_skills')} icon={GraduationCap}>
          <DescriptionList
            items={[
              {
                label: tf('form.education_group'),
                value: <EducationText education={p.educationDetails} />,
              },
              ...(p.education ? [{ label: tf('form.education'), value: p.education }] : []),
              {
                label: tf('form.skills'),
                value: (
                  <SkillsText
                    interestAreas={p.interestAreas}
                    vehicle={p.vehicle}
                    canSwim={p.canSwim}
                    availability={p.availability}
                    emergencyFullTime={p.emergencyFullTime}
                  />
                ),
              },
            ]}
          />
        </ProfileSection>
        <ProfileSection title={t('work_section')} icon={Briefcase}>
          <DescriptionList
            items={[
              {
                label: tf('form.profession_group'),
                value: <ProfessionText profession={p.profession} details={p.professionDetails} />,
              },
              ...(p.experience ? [{ label: tf('form.experience'), value: p.experience }] : []),
              ...(p.workDescription
                ? [{ label: tf('form.work_description'), value: p.workDescription }]
                : []),
              { label: tf('form.previous_projects'), value: p.previousProjects ?? empty },
            ]}
          />
        </ProfileSection>
        <ProfileSection title={t('sections.bank')} icon={Landmark} defaultOpen={false}>
          {p.bank ? (
            <DescriptionList
              columns={2}
              items={[
                { label: tf('form.bank_name'), value: p.bank.bankName ?? empty },
                { label: tf('form.account_name'), value: p.bank.accountName ?? empty },
                { label: tf('form.account_number'), value: p.bank.accountNumber ?? empty },
                { label: tf('form.branch_name'), value: p.bank.branchName ?? empty },
                { label: tf('form.routing_number'), value: p.bank.routingNumber ?? empty },
              ]}
            />
          ) : (
            <Text>{hidden}</Text>
          )}
        </ProfileSection>
      </Grid>
      <Grid gap={3} as="aside">
        <DocumentStrip view={p} />
        <ProfileSection title={t('contact')} icon={Phone}>
          {contacts.length > 0 ? <ContactList items={contacts} /> : <Text>{empty}</Text>}
        </ProfileSection>
        <ProfileSection title={t('history_title')} icon={CalendarDays}>
          <RegistrationTimeline view={p} registration={registration} />
        </ProfileSection>
      </Grid>
    </div>
  );
}

/** The registration's way so far: submitted, the corrections asked, the decision, a block. */
function RegistrationTimeline({
  view: p,
  registration,
}: {
  view: View;
  registration?: RegistrationDetailView;
}) {
  const t = useTranslations('admin.volunteers.profile');
  const tr = useTranslations('admin.registrations');
  const tf = useTranslations('registration');
  const locale = useLocale() as Locale;
  const steps: TimelineStep[] = [
    {
      id: 'submitted',
      title: t('history.submitted'),
      time: formatDateTime(p.registeredAt, locale),
      status: 'done',
    },
    ...(registration?.corrections ?? []).map((c): TimelineStep => ({
      id: c.id,
      title: t('history.correction', {
        field: c.field in FIELD_LABEL ? tf(FIELD_LABEL[c.field as RequestField]) : c.field,
      }),
      comment: [tr(`corrections.status.${c.status}`), c.note].filter(Boolean).join(' · '),
      status: c.status === 'open' ? 'current' : 'done',
    })),
    ...(registration
      ? [
          {
            id: 'decision',
            title: t('history.awaiting'),
            status: registration.status === 'in_correction' ? 'upcoming' : 'current',
          } satisfies TimelineStep,
        ]
      : p.approvedAt
        ? [
            {
              id: 'decision',
              title: t('history.approved'),
              time: formatDateTime(p.approvedAt, locale),
              status: 'done',
            } satisfies TimelineStep,
          ]
        : []),
    ...(p.blocklist.blocked
      ? [
          {
            id: 'blocked',
            title: t('history.blocked'),
            time: p.blocklist.blockedAt ? formatDateTime(p.blocklist.blockedAt, locale) : undefined,
            comment: p.blocklist.reason,
            status: 'rejected' as const,
          },
        ]
      : []),
  ];
  return <Timeline label={t('history_title')} steps={steps} />;
}

function DocumentsTab({ view }: { view: View }) {
  const t = useTranslations('admin.volunteers.profile');
  return (
    <div className="admin-photos">
      {useDocumentSlots(view).map((slot) => (
        <Grid gap={1} as="figure" key={slot.id}>
          <figcaption>{slot.label}</figcaption>
          {!slot.visible ? (
            <span>{t('hidden')}</span>
          ) : slot.fileId ? (
            <FileImage fileId={slot.fileId} alt={slot.label} />
          ) : (
            <span>{t('no_photo')}</span>
          )}
        </Grid>
      ))}
    </div>
  );
}

function WorkTab({ view: p }: { view: View }) {
  const { me } = useAuth();
  const transfers = Boolean(me && canTransferApplications(me));
  const t = useTranslations('admin.volunteers.profile');
  const tf = useTranslations('registration');
  const locale = useLocale() as Locale;
  const empty = tf('profile.empty');
  return (
    <Grid gap={3}>
      <ProfileSection title={t('sections.projects')} icon={Briefcase}>
        {p.projects.length === 0 ? (
          <Text className="admin-muted">{t('no_projects')}</Text>
        ) : (
          <Grid gap={2} as="ul" role="list">
            {p.projects.map((project) => (
              <Stack direction="row" wrap align="center" gap={2} as="li" key={project.id}>
                <strong>{locale === 'en' ? project.nameEn : project.nameBn}</strong>
                <span className="admin-muted">{project.year}</span>
                <span>
                  {t('permission_set')}: {project.permissionSet}
                </span>
                {project.isPaid && <Badge tone="info" label={t('paid')} />}
                {transfers ? (
                  <Link to={`/admin/projects/${project.id}/transfer?from=${p.id}`}>
                    {t('transfer')}
                  </Link>
                ) : null}
              </Stack>
            ))}
          </Grid>
        )}
      </ProfileSection>
      <ProfileSection title={t('sections.team')} icon={User}>
        {p.team.length === 0 ? (
          <Text className="admin-muted">{t('no_team')}</Text>
        ) : (
          <Grid gap={2} as="ul" role="list">
            {p.team.map((m) => (
              <li key={m.id}>
                <Link to={`/admin/volunteers/${m.id}`}>{m.displayName}</Link>
              </li>
            ))}
          </Grid>
        )}
      </ProfileSection>
      <ProfileSection title={t('sections.summary')}>
        <Text className="admin-muted">{t('summary_later')}</Text>
      </ProfileSection>
      {'category' in p && (
        <ProfileSection title={t('sections.ratings')}>
          <DescriptionList
            items={[
              {
                label: t('category'),
                value:
                  [p.category, p.inactiveFlag ? t('inactive') : null].filter(Boolean).join(' · ') ||
                  empty,
              },
            ]}
          />
          {p.ratings?.length === 0 && <Text className="admin-muted">{t('no_ratings')}</Text>}
        </ProfileSection>
      )}
    </Grid>
  );
}

function HistoryTab({
  view: p,
  registration,
}: {
  view: View;
  registration?: RegistrationDetailView;
}) {
  const t = useTranslations('admin.volunteers.profile');
  return (
    <Grid gap={3}>
      <ProfileSection title={t('history_title')} icon={CalendarDays}>
        <RegistrationTimeline view={p} registration={registration} />
      </ProfileSection>
      <ProfileSection title={t('sections.blocklist')} icon={Ban}>
        <Grid gap={2}>
          <Text>
            {p.blocklist.blocked && p.blocklist.blockedAt
              ? t('blocked_since', { date: formatDate(p.blocklist.blockedAt) })
              : t('not_blocked')}
          </Text>
          {p.blocklist.reason && (
            <Text>
              {t('reason')}: {p.blocklist.reason}
            </Text>
          )}
        </Grid>
      </ProfileSection>
    </Grid>
  );
}
