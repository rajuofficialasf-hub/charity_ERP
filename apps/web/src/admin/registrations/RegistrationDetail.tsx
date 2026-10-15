import { formatDate, formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@css/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FilePenLine, UserCheck, X } from 'lucide-react';
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
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canApproveStaff, canBlock, canApproveRegistrations } from '../roles';
import { AddressNames } from '../../components/AddressNames';
import { BlocklistAction } from './Blocklist';
import { CorrectionDialog } from './CorrectionDialog';
import { FileImage } from '../../components/FileImage';
import {
  approve,
  detailKey,
  LIST_KEY,
  registrationDetail,
  type RegistrationDetailView,
  reject,
} from './registrations-api';
import type { ListNotice } from './RegistrationsPage';
import { StaffDecisionDialog } from './StaffDecisionDialog';

type Dialog = 'approve' | 'reject' | 'correct' | 'staff' | null;

/**
 * The page of one pending staff registration (SCR-040). A volunteer's registration is reviewed in
 * the volunteer tab (DECISION_LOG O-67), so an older link to it opens the volunteer's profile.
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
 * One pending registration (plan docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md,
 * R7 to R9, R12): the submitted details and photos, the correction requests, and the decisions the
 * user's role allows. Used by the staff registration page and by the volunteer profile of a pending
 * volunteer. The server checks permission and scope again on every action.
 */
export function RegistrationReview({
  userId,
  finishedTo,
}: {
  userId: string;
  /** Where a final decision leads, with its message (the registration has left the list). */
  finishedTo: string;
}) {
  const { me } = useAuth();
  const t = useTranslations('admin.registrations');
  const tc = useTranslations('common');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const reg = useQuery({
    queryKey: detailKey(userId),
    queryFn: () => registrationDetail(userId),
    retry: false,
  });
  /** A final decision: the registration leaves the list; the list shows the message. */
  const finished = (message: string) => {
    void queryClient.invalidateQueries({ queryKey: LIST_KEY });
    void navigate(finishedTo, { state: { notice: message } satisfies ListNotice });
  };
  const changed = (message: string) => {
    setDialog(null);
    setNotice(message);
    void queryClient.invalidateQueries({ queryKey: detailKey(userId) });
    void queryClient.invalidateQueries({ queryKey: LIST_KEY });
  };
  const approval = useMutation({
    mutationFn: () => approve(userId),
    onSuccess: () => finished(t('approved')),
  });
  const rejection = useMutation({
    mutationFn: (reason: string) => reject(userId, reason.trim()),
    onSuccess: () => finished(t('rejected')),
  });

  if (!me) return null;
  if (reg.isPending) return <Skeleton count={4} />;
  if (reg.error instanceof ApiFailure && reg.error.status === 404)
    return <EmptyState icon={UserCheck} title={t('not_found')} />;
  if (reg.error || !reg.data)
    return (
      <ErrorState
        title={tc('state.error.text')}
        requestId={reg.error instanceof ApiFailure ? reg.error.requestId : undefined}
        onRetry={() => void reg.refetch()}
      />
    );
  const r = reg.data;
  const decisionError = [approval.error, rejection.error].find((e) => e instanceof ApiFailure) as
    ApiFailure | undefined;
  const closeDialog = () => {
    approval.reset();
    rejection.reset();
    setDialog(null);
  };

  return (
    <>
      <DocumentTitle title={r.displayName} />
      <h1 className="admin-title">{r.displayName}</h1>
      <div className="flex flex-wrap gap-2">
        <Badge label={r.kind === 'staff' ? t('kind.staff') : t('kind.volunteer')} />
        <Badge
          tone={r.status === 'in_correction' ? 'warning' : 'info'}
          label={t(`status.${r.status}`)}
        />
      </div>
      {notice && (
        <Alert tone="success" live="status" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {r.blocklisted && <Alert tone="danger">{t('blocklisted')}</Alert>}

      <Section title={t('actions')}>
        <div className="flex flex-wrap gap-2">
          {r.kind === 'volunteer' ? (
            <>
              <Button
                icon={Check}
                disabled={r.blocklisted || r.status === 'in_correction'}
                onPress={() => setDialog('approve')}
              >
                {t('approve')}
              </Button>
              <Button variant="secondary" icon={FilePenLine} onPress={() => setDialog('correct')}>
                {t('correct')}
              </Button>
              <Button variant="secondary" icon={X} onPress={() => setDialog('reject')}>
                {t('reject')}
              </Button>
              {canBlock(me) && r.volunteer && (
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
              <Button icon={Check} onPress={() => setDialog('staff')}>
                {t('staff.decide')}
              </Button>
            )
          )}
        </div>
      </Section>

      <Details registration={r} />
      <Photos registration={r} />
      {r.corrections.length > 0 && <Corrections registration={r} />}

      <ConfirmDialog
        isOpen={dialog === 'approve'}
        title={t('approve_title', { name: r.displayName })}
        message={
          <>
            {t('approve_body')}
            {decisionError && <p className="admin-error">{decisionError.message}</p>}
          </>
        }
        confirmLabel={t('approve_confirm')}
        pending={approval.isPending}
        onConfirm={() => approval.mutate()}
        onCancel={closeDialog}
      />
      <ConfirmDialog
        isOpen={dialog === 'reject'}
        title={t('reject_title', { name: r.displayName })}
        message={decisionError && <p className="admin-error">{decisionError.message}</p>}
        tone="danger"
        reasonRequired
        reasonLabel={t('reason')}
        confirmLabel={t('reject_confirm')}
        pending={rejection.isPending}
        onConfirm={(reason) => rejection.mutate(reason)}
        onCancel={closeDialog}
      />
      <CorrectionDialog
        userId={userId}
        isOpen={dialog === 'correct'}
        onClose={closeDialog}
        onDone={() => changed(t('corrected'))}
      />
      <StaffDecisionDialog
        userId={userId}
        name={r.displayName}
        isOpen={dialog === 'staff'}
        onClose={closeDialog}
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
        // the earlier work texts only when the volunteer has them (O-65)
        ...(v.experience ? [[tf('form.experience'), v.experience] as [string, ReactNode]] : []),
        ...(v.workDescription
          ? [[tf('form.work_description'), v.workDescription] as [string, ReactNode]]
          : []),
        [tf('form.previous_projects'), v.previousProjects ?? empty],
        [tf('form.facebook'), v.facebookId ?? empty],
        // the personal data of O-65: the protected ones are absent without the identity class
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
        <p className="admin-muted m-0">
          {t('column.submitted')}: {formatDateTime(r.submittedAt, locale)}
        </p>
        <dl className="grid gap-2 sm:grid-cols-[12rem_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="font-bold">{label}</dt>
              <dd className="m-0">{value}</dd>
            </div>
          ))}
        </dl>
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
          <figure key={label} className="m-0 grid gap-1">
            <figcaption className="font-bold">{label}</figcaption>
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
      <ul className="m-0 grid gap-2 p-0" role="list">
        {r.corrections.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2">
            <strong>
              {c.field in FIELD_LABEL ? tf(FIELD_LABEL[c.field as RequestField]) : c.field}
            </strong>
            <Badge
              size="sm"
              tone={c.status === 'open' ? 'warning' : 'info'}
              label={t(`corrections.status.${c.status}`)}
            />
            {c.note && <span className="admin-muted m-0">{c.note}</span>}
          </li>
        ))}
      </ul>
    </Section>
  );
}
