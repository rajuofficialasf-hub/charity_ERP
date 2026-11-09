import { formatDate, formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Alert,
  Button,
  Card,
  Chip,
  DescriptionList,
  EmptyState,
  Page,
  Skeleton,
  Stack,
} from '@/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useId, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import {
  EducationText,
  PermanentAddressText,
  ProfessionText,
  SkillsText,
} from '../../features/account/DetailValues';
import { FIELD_LABEL, type RequestField } from '../../features/account/profile-api';
import { ApiFailure } from '../../api/client';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canApproveStaff, canBlock, canApproveRegistrations } from '../roles';
import { AddressNames } from '../../components/AddressNames';
import { BlocklistAction } from './Blocklist';
import { FileImage } from '../../components/FileImage';
import {
  detailKey,
  LIST_KEY,
  registrationDetail,
  type RegistrationDetailView,
} from './registrations-api';
import type { ListNotice } from './RegistrationsPage';
import { StaffDecisionDialog } from './StaffDecisionDialog';
import { VolunteerDecisions } from './VolunteerDecisions';
import { VOLUNTEERS_KEY } from '../volunteers/volunteers-api';
import { LoadError } from '../../components/LoadError';

/**
 * The page of one pending staff registration (SCR-040). A volunteer's registration is reviewed in
 * the volunteer tab, so an older link to it opens the volunteer's profile.
 */
export function RegistrationDetail() {
  const { me } = useAuth();
  const { userId = '' } = useParams();
  const t = useTranslations('admin.registrations');
  const reg = useQuery({
    queryKey: detailKey(userId),
    queryFn: () => registrationDetail(userId),
    retry: false,
  });
  if (!me) return null;
  if (!canApproveRegistrations(me)) return <ForbiddenContent />;
  if (reg.data?.kind === 'volunteer' && reg.data.volunteer)
    return <Navigate to={`/admin/volunteers/${reg.data.volunteer.id}`} replace />;
  return (
    <>
      <div>
        <Link to="/admin/registrations">{t('back')}</Link>
      </div>
      <RegistrationReview userId={userId} finishedTo="/admin/registrations" />
    </>
  );
}

/**
 * One pending registration: the submitted details and photos, the correction requests, and the
 * decisions the user's role allows. Used by the staff registration page and by the volunteer
 * profile of a pending volunteer. The server checks permission and scope again on every action.
 */
export function RegistrationReview({
  userId,
  finishedTo,
  allowed,
}: {
  userId: string;
  /** Where a final decision leads, with its message (the registration has left the list). */
  finishedTo: string;
  /**
   * What the server allows on this volunteer (the volunteer profile passes its action flags); a
   * button shows only for an allowed action. Without it the role lists decide, as before.
   */
  allowed?: {
    review: boolean;
    approve: boolean;
    requestCorrection: boolean;
    block: boolean;
    unblock: boolean;
  };
}) {
  const { me } = useAuth();
  const t = useTranslations('admin.registrations');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [staffOpen, setStaffOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const reg = useQuery({
    queryKey: detailKey(userId),
    queryFn: () => registrationDetail(userId),
    retry: false,
  });
  /** A final decision: the registration leaves the list; the list shows the message. */
  // the volunteer tab and its profiles show the same people, so their answers go stale too
  const stale = () => {
    void queryClient.invalidateQueries({ queryKey: LIST_KEY });
    void queryClient.invalidateQueries({ queryKey: VOLUNTEERS_KEY });
  };
  const finished = (message: string) => {
    stale();
    void navigate(finishedTo, { state: { notice: message } satisfies ListNotice });
  };
  const changed = (message: string) => {
    setNotice(message);
    void queryClient.invalidateQueries({ queryKey: detailKey(userId) });
    stale();
  };

  if (!me) return null;
  if (reg.isPending) return <Skeleton count={4} />;
  if (reg.error instanceof ApiFailure && reg.error.status === 404)
    return <EmptyState title={t('not_found')} />;
  if (reg.error || !reg.data)
    return <LoadError error={reg.error} onRetry={() => void reg.refetch()} />;
  const r = reg.data;

  return (
    <>
      <DocumentTitle title={r.displayName} />
      <Page title={r.displayName} documentTitle={false} />
      <div className="admin-badges">
        <Chip>{r.kind === 'staff' ? t('kind.staff') : t('kind.volunteer')}</Chip>
        <Chip tone={r.status === 'in_correction' ? 'warning' : 'info'}>
          {t(`status.${r.status}`)}
        </Chip>
      </div>
      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {r.blocklisted && <Alert tone="error">{t('blocklisted')}</Alert>}

      <Section title={t('actions')}>
        <Stack direction="row" wrap gap={2}>
          {r.kind === 'volunteer' ? (
            <>
              <VolunteerDecisions
                userId={userId}
                name={r.displayName}
                inCorrection={r.status === 'in_correction'}
                blocklisted={r.blocklisted}
                allowed={allowed}
                finishedTo={finishedTo}
                onChanged={changed}
              />
              {(allowed ? allowed.block || allowed.unblock : canBlock(me)) && r.volunteer && (
                <BlocklistAction
                  volunteerId={r.volunteer.id}
                  name={r.displayName}
                  blocked={r.blocklisted}
                  onDone={changed}
                />
              )}
            </>
          ) : (
            canApproveStaff(me) && (
              <Button startIcon="check" onClick={() => setStaffOpen(true)}>
                {t('staff.decide')}
              </Button>
            )
          )}
        </Stack>
      </Section>

      <Details registration={r} />
      <Photos registration={r} />
      {r.corrections.length > 0 && <Corrections registration={r} />}

      <StaffDecisionDialog
        userId={userId}
        name={r.displayName}
        open={staffOpen}
        onClose={() => setStaffOpen(false)}
        onDone={(decision) =>
          finished(decision === 'approve' ? t('staff.approved') : t('rejected'))
        }
      />
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

function Details({ registration: r }: { registration: RegistrationDetailView }) {
  const t = useTranslations('admin.registrations');
  const tf = useTranslations('registration');
  const locale = useLocale() as Locale;
  const v = r.volunteer;
  const empty = tf('profile.empty');
  const hidden = t('hidden');
  const rows: [string, ReactNode][] = v
    ? [
        [tf('form.type'), tf(`form.types.${v.type as 'general'}`)],
        [tf('form.father_name'), v.fatherName],
        [tf('form.mother_name'), v.motherName],
        [tf('form.nid'), v.nid ?? hidden],
        [tf('form.mobile'), r.mobile ?? empty],
        [tf('form.email'), r.email ?? empty],
        [tf('form.whatsapp'), v.whatsapp ?? empty],
        [tf('form.address'), <AddressNames key="address" address={v} />],
        [tf('form.address_line'), v.addressLine ?? empty],
        [
          tf('form.address_permanent'),
          <PermanentAddressText key="permanent" address={v.permanentAddress} />,
        ],
        [
          tf('form.education_group'),
          <EducationText key="education" education={v.educationDetails} />,
        ],
        [tf('form.education'), v.education ?? empty],
        // the earlier work texts only when the volunteer has them
        ...(v.experience ? [[tf('form.experience'), v.experience] as [string, ReactNode]] : []),
        ...(v.workDescription
          ? [[tf('form.work_description'), v.workDescription] as [string, ReactNode]]
          : []),
        [tf('form.previous_projects'), v.previousProjects ?? empty],
        [tf('form.facebook'), v.facebookId ?? empty],
        // the personal data: the protected ones are absent without the identity class
        [
          tf('form.date_of_birth'),
          v.dateOfBirth === undefined ? hidden : v.dateOfBirth ? formatDate(v.dateOfBirth) : empty,
        ],
        [tf('form.blood_group'), v.bloodGroup === undefined ? hidden : (v.bloodGroup ?? empty)],
        [tf('form.tshirt_size'), v.tshirtSize ?? empty],
        [
          tf('form.volunteering_area'),
          v.volunteeringArea
            ? tf(`lists.volunteering_area.${v.volunteeringArea as 'anywhere'}`)
            : empty,
        ],
        [
          tf('form.profession_group'),
          <ProfessionText
            key="profession"
            profession={v.profession}
            details={v.professionDetails}
          />,
        ],
        [
          tf('form.skills'),
          <SkillsText
            key="skills"
            interestAreas={v.interestAreas}
            vehicle={v.vehicle}
            canSwim={v.canSwim}
            availability={v.availability}
            emergencyFullTime={v.emergencyFullTime}
          />,
        ],
      ]
    : [
        [tf('form.designation'), r.designation ?? empty],
        [tf('form.mobile'), r.mobile ?? empty],
        [tf('form.email'), r.email ?? empty],
      ];
  return (
    <Section title={t('details')}>
      <Card>
        <p className="admin-muted">
          {t('column.submitted')}: {formatDateTime(r.submittedAt, locale)}
        </p>
        <DescriptionList items={rows.map(([label, value]) => ({ label, value }))} />
      </Card>
    </Section>
  );
}

function Photos({ registration: r }: { registration: RegistrationDetailView }) {
  const t = useTranslations('admin.registrations');
  const tf = useTranslations('registration.form');
  const photo = r.volunteer?.photoFileId ?? r.photoFileId;
  const slots: [string, string | null | undefined, boolean][] = [[tf('photo'), photo, true]];
  if (r.volunteer)
    slots.push(
      [tf('nid_photo'), r.volunteer.nidPhotoFileId, 'nidPhotoFileId' in r.volunteer],
      [tf('nid_photo_back'), r.volunteer.nidPhotoBackFileId, 'nidPhotoBackFileId' in r.volunteer],
    );
  return (
    <Section title={t('photos')}>
      <div className="admin-photos">
        {slots.map(([label, fileId, visible]) => (
          <figure className="admin-photo" key={label}>
            <figcaption>{label}</figcaption>
            {!visible ? (
              <span>{t('hidden')}</span>
            ) : fileId ? (
              <FileImage fileId={fileId} alt={label} />
            ) : (
              <span>{t('no_photo')}</span>
            )}
          </figure>
        ))}
      </div>
    </Section>
  );
}

function Corrections({ registration: r }: { registration: RegistrationDetailView }) {
  const t = useTranslations('admin.registrations');
  const tf = useTranslations('registration');
  return (
    <Section title={t('corrections.title')}>
      <ul className="admin-plain-list">
        {r.corrections.map((c) => (
          <li key={c.id}>
            <Stack direction="row" wrap align="center" gap={2}>
              <strong>
                {c.field in FIELD_LABEL ? tf(FIELD_LABEL[c.field as RequestField]) : c.field}
              </strong>
              <Chip tone={c.status === 'open' ? 'warning' : 'info'}>
                {t(`corrections.status.${c.status}`)}
              </Chip>
              {c.note && <span className="admin-muted">{c.note}</span>}
            </Stack>
          </li>
        ))}
      </ul>
    </Section>
  );
}
