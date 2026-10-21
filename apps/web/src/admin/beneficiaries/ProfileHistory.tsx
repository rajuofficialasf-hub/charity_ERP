import { formatDate } from '@css/shared/format';
import { Badge, Button, ConfirmDialog, Grid, ProfileSection, Stack, Text } from '@css/ui';
import { useMutation } from '@tanstack/react-query';
import { Check, FileText, History, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
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
  const tone = { submitted: 'warning', approved: 'success', rejected: 'danger' } as const;

  return (
    <ProfileSection title={tp('sections.corrections')} icon={FileText}>
      {requests.length === 0 ? (
        <Text className="admin-muted">{tp('no_rows')}</Text>
      ) : (
        <Grid gap={3} as="ul" role="list">
          {requests.map((r) => (
            <Grid gap={1} as="li" key={r.id}>
              <Stack direction="row" wrap gap={2}>
                <strong>{label(r.field)}</strong>
                <Badge
                  variant="dot"
                  tone={tone[r.status]}
                  label={tp(`correction_status.${r.status}`)}
                />
              </Stack>
              <span>{tp('change', { old: r.oldValue ?? empty, new: r.newValue ?? empty })}</span>
              <Text tone="muted">{tp('reason', { reason: r.reason })}</Text>
              <Text tone="muted">{tp('requested_on', { date: formatDate(r.requestedAt) })}</Text>
              {canDecide && r.status === 'submitted' && r.requestedBy !== me?.id && (
                <Stack direction="row" wrap gap={2}>
                  <Button
                    size="sm"
                    icon={Check}
                    onPress={() => setDeciding({ request: r, decision: 'approve' })}
                  >
                    {tp('correction_approve')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={X}
                    onPress={() => setDeciding({ request: r, decision: 'reject' })}
                  >
                    {tp('correction_reject')}
                  </Button>
                </Stack>
              )}
            </Grid>
          ))}
        </Grid>
      )}
      {deciding?.decision === 'approve' && (
        <ConfirmDialog
          isOpen
          title={tp('correction_approve_title', { field: label(deciding.request.field) })}
          message={
            failure && (
              <p className="admin-error">{failure.details[0]?.message ?? failure.message}</p>
            )
          }
          consequence={[
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
    <ProfileSection title={tp('sections.contact_log')} icon={History}>
      {rows.length === 0 ? (
        <Text className="admin-muted">{tp('no_rows')}</Text>
      ) : (
        <Grid gap={2} as="ul" role="list">
          {rows.map((c, i) => (
            <Grid gap={1} as="li" key={`${c.at}-${c.field}-${i}`}>
              <strong>{label(c.field)}</strong>
              <span>
                {c.field.endsWith('_id')
                  ? tp('place_changed')
                  : tp('change', { old: c.oldValue ?? empty, new: c.newValue ?? empty })}
              </span>
              <Text tone="muted">{formatDate(c.at)}</Text>
            </Grid>
          ))}
        </Grid>
      )}
    </ProfileSection>
  );
}
