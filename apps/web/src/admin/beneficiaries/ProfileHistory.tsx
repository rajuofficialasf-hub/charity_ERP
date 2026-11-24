import { formatDate } from '@css/shared/format';
import { Button, Chip, ConfirmDialog, ProfileSection, Stack, Text } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../api/client';
import { useAuth } from '../../lib/auth';
import { ReasonDialog } from '../projects/ReasonDialog';
import {
  type BeneficiaryProfile,
  type CorrectionRequest,
  decideCorrection,
} from './beneficiaries-api';

const FILE_KINDS = [
  'distribution_proof',
  'construction_proof',
  'evidence',
  'voucher',
  'payment_copy',
  'document',
  'animal_photo',
  'profile_photo',
  'nid_photo',
  'media_asset',
  'issue_photo',
] as const;

/** The name of a kind of file; an unknown kind shows as it is. */
export function useFileKind() {
  const t = useTranslations('admin.beneficiaries.profile.file_kinds');
  return (kind: string) =>
    (FILE_KINDS as readonly string[]).includes(kind) ? t(kind as 'document') : kind;
}

/** The label of a changed or corrected field; an unknown field shows as it is. */
function useFieldLabel() {
  const t = useTranslations('admin.beneficiaries.profile.fields');
  const known = [
    'mobile',
    'mobile_owner_code',
    'mobile_owner_name',
    'division_id',
    'district_id',
    'upazila_id',
    'union_id',
    'village',
    'post_office',
    'post_code',
    'landmark',
    'name',
    'father_or_husband_name',
    'nid',
    'birth_reg',
  ];
  return (field: string) => (known.includes(field) ? t(field as 'mobile') : field);
}

/**
 * The correction requests of a profile, newest first, with approve and reject for an official
 * who decides them. The requester never decides the own request, so those buttons are left out.
 */
export function Corrections({
  requests,
  canDecide,
  onDone,
}: {
  requests: CorrectionRequest[];
  canDecide: boolean;
  onDone: (message: string) => void;
}) {
  const tp = useTranslations('admin.beneficiaries.profile');
  const label = useFieldLabel();
  const { me } = useAuth();
  const [deciding, setDeciding] = useState<{
    request: CorrectionRequest;
    decision: 'approve' | 'reject';
  } | null>(null);
  const decide = useMutation({
    mutationFn: (reason: string) =>
      decideCorrection(
        deciding!.request.id,
        deciding!.decision === 'approve' ? { decision: 'approve' } : { decision: 'reject', reason },
      ),
    onSuccess: () => {
      const approved = deciding?.decision === 'approve';
      setDeciding(null);
      decide.reset();
      onDone(tp(approved ? 'correction_approved' : 'correction_rejected'));
    },
  });
  const close = () => {
    setDeciding(null);
    decide.reset();
  };
  const failure = decide.error instanceof ApiFailure ? decide.error : null;
  const empty = tp('empty_value');
  const tone = { submitted: 'warning', approved: 'success', rejected: 'error' } as const;

  return (
    <ProfileSection title={tp('sections.corrections')} icon="file">
      {requests.length === 0 ? (
        <p className="admin-muted">{tp('no_rows')}</p>
      ) : (
        <ul className="admin-plain-list">
          {requests.map((r) => (
            <li className="admin-plain-item" key={r.id}>
              <Stack direction="row" wrap gap={2}>
                <strong>{label(r.field)}</strong>
                <Chip tone={tone[r.status]}>{tp(`correction_status.${r.status}`)}</Chip>
              </Stack>
              <span>{tp('change', { old: r.oldValue ?? empty, new: r.newValue ?? empty })}</span>
              <Text tone="muted">{tp('reason', { reason: r.reason })}</Text>
              <Text tone="muted">
                {r.requestedByName
                  ? tp('requested_by_on', {
                      name: r.requestedByName,
                      date: formatDate(r.requestedAt),
                    })
                  : tp('requested_on', { date: formatDate(r.requestedAt) })}
              </Text>
              {r.decidedAt && r.status !== 'submitted' ? (
                <Text tone="muted">
                  {tp(r.status === 'approved' ? 'approved_by_on' : 'rejected_by_on', {
                    name: r.decidedByName ?? tp('by_system'),
                    date: formatDate(r.decidedAt),
                  })}
                </Text>
              ) : null}
              {canDecide && r.status === 'submitted' && r.requestedBy !== me?.id && (
                <Stack direction="row" wrap gap={2}>
                  <Button
                    size="small"
                    startIcon="check"
                    onClick={() => setDeciding({ request: r, decision: 'approve' })}
                  >
                    {tp('correction_approve')}
                  </Button>
                  <Button
                    size="small"
                    variant="secondary"
                    startIcon="close"
                    onClick={() => setDeciding({ request: r, decision: 'reject' })}
                  >
                    {tp('correction_reject')}
                  </Button>
                </Stack>
              )}
            </li>
          ))}
        </ul>
      )}
      {deciding?.decision === 'approve' && (
        <ConfirmDialog
          open
          title={tp('correction_approve_title', { field: label(deciding.request.field) })}
          message={
            failure && (
              <p className="admin-error">{failure.details[0]?.message ?? failure.message}</p>
            )
          }
          consequences={[
            tp('change', {
              old: deciding.request.oldValue ?? empty,
              new: deciding.request.newValue ?? empty,
            }),
          ]}
          confirmLabel={tp('correction_approve')}
          pending={decide.isPending}
          onConfirm={() => decide.mutate('')}
          onCancel={close}
        />
      )}
      {deciding?.decision === 'reject' && (
        <ReasonDialog
          title={tp('correction_reject_title', { field: label(deciding.request.field) })}
          confirm={tp('correction_reject')}
          danger
          pending={decide.isPending}
          error={decide.error}
          onConfirm={({ reason }) => decide.mutate(reason)}
          onClose={close}
        />
      )}
    </ProfileSection>
  );
}

/**
 * Each change of the mobile and the address made outside an application, newest first. A place of
 * the address is an id in the log, so only the change itself is named.
 */
export function ContactLog({ rows }: { rows: NonNullable<BeneficiaryProfile['contactLog']> }) {
  const tp = useTranslations('admin.beneficiaries.profile');
  const label = useFieldLabel();
  const empty = tp('empty_value');
  return (
    <ProfileSection title={tp('sections.contact_log')} icon="history">
      {rows.length === 0 ? (
        <p className="admin-muted">{tp('no_rows')}</p>
      ) : (
        <ul className="admin-plain-list">
          {rows.map((c, i) => (
            <li className="admin-plain-item" key={`${c.at}-${c.field}-${i}`}>
              <strong>{label(c.field)}</strong>
              <span>
                {c.field.endsWith('_id')
                  ? tp('place_changed')
                  : tp('change', { old: c.oldValue ?? empty, new: c.newValue ?? empty })}
              </span>
              <Text tone="muted">
                {c.byName
                  ? tp('by_on', { name: c.byName, date: formatDate(c.at) })
                  : formatDate(c.at)}
              </Text>
            </li>
          ))}
        </ul>
      )}
    </ProfileSection>
  );
}

/** The steps the trail tells, each with its words; another step shows a general line. */
const TRAIL_STEPS = [
  'beneficiary.create',
  'beneficiary.contact_updated',
  'beneficiary.correction_requested',
  'beneficiary.correction_decided',
  'beneficiary.identity_added',
  'beneficiary.merge',
  'beneficiary.merge_reverted',
  'blocklist.set',
  'blocklist.lift',
  'application.submit',
  'application.public_submitted',
  'application.reviewed',
  'application.approve',
  'application.reject',
  'application.waitlisted',
  'application.pull_from_waitlist',
  'application.reopened',
  'application.transferred',
  'application.unlock_decided',
] as const;

/**
 * The audited steps of the person and of the applications the viewer sees, newest first: what was
 * done, on which application, by whom and when.
 */
export function Trail({ steps }: { steps: NonNullable<BeneficiaryProfile['trail']> }) {
  const tp = useTranslations('admin.beneficiaries.profile');
  const tt = useTranslations('admin.beneficiaries.profile.trail');
  const what = (action: string) =>
    (TRAIL_STEPS as readonly string[]).includes(action)
      ? tt(action.replace('.', '_') as 'beneficiary_create')
      : tt('other');
  return (
    <ProfileSection title={tp('sections.activities')} icon="history">
      {steps.length === 0 ? (
        <p className="admin-muted">{tp('no_rows')}</p>
      ) : (
        <ul className="admin-plain-list">
          {steps.map((step) => (
            <li className="admin-plain-item" key={step.id}>
              <strong>
                {step.appNo
                  ? tt('on_application', { what: what(step.action), appNo: step.appNo })
                  : what(step.action)}
              </strong>
              <Text tone="muted">
                {tp('by_on', { name: step.byName ?? tp('by_system'), date: formatDate(step.at) })}
              </Text>
            </li>
          ))}
        </ul>
      )}
    </ProfileSection>
  );
}
