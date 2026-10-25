import { formatBenNo } from '@css/shared/beneficiaries';
import { identityColumn } from '@css/shared/forms';
import { Alert, Button, DescriptionList, Modal, Select, Skeleton, Stack, Text } from '@css/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { lookupBeneficiary } from '../beneficiaries/beneficiaries-api';
import { assignments, volunteersKey } from '../projects/volunteers/project-volunteers-api';
import { type OfficeApplication, officeAct } from './applications-api';

/** The identity number the entry gave, as its answer holds it. */
function numberOf(a: OfficeApplication): string | null {
  const field = a.form.sections
    .flatMap((s) => s.fields)
    .find((f) => f.standardColumn === 'nid_or_birth_reg');
  const answer = field ? a.answers.find((x) => x.fieldKey === field.fieldKey) : undefined;
  const value = answer ? (answer.value as { v?: unknown }).v : undefined;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * The verification of a public or offline entry: a link to the profile the entry's number already
 * has, shown with the lookup's own fields (never the whole profile), or a new profile made from
 * the entry; either one may take a volunteer of the project as its owner, or stay the office's.
 * A blocked person's entry can only be refused, which the record's own button does.
 */
export function VerifyDialog({
  application: a,
  etag,
  action,
  onClose,
  onDone,
}: {
  application: OfficeApplication;
  etag: string;
  action: 'verify_link' | 'verify_create';
  onClose: () => void;
  onDone: () => Promise<unknown> | void;
}) {
  const t = useTranslations('applications.office.verify');
  const tc = useTranslations('common');
  const number = numberOf(a);
  const [owner, setOwner] = useState<string | null>(null);
  const lookup = useQuery({
    queryKey: ['admin', 'verify-lookup', a.id, number],
    queryFn: () =>
      lookupBeneficiary(
        identityColumn(number ?? '') === 'nid'
          ? { nid: number ?? '', projectId: a.projectId }
          : { birthReg: number ?? '', projectId: a.projectId },
      ),
    enabled: action === 'verify_link' && Boolean(number),
  });
  const people = useQuery({
    queryKey: [...volunteersKey(a.projectId), 'verify'],
    queryFn: async () => (await assignments(a.projectId, null)).data,
  });
  const found = lookup.data?.found && !lookup.data.blocked ? lookup.data.autofill : undefined;
  const send = useMutation({
    mutationFn: () =>
      officeAct(a.id, etag, action, {
        ...(action === 'verify_link' && found ? { linkBeneficiaryId: found.beneficiaryId } : {}),
        ...(owner ? { ownerVolunteerId: owner } : {}),
      }),
    onSuccess: () => onDone(),
  });
  const ready = action === 'verify_create' || Boolean(found);
  const failure =
    send.error instanceof ApiFailure
      ? (send.error.details[0]?.message ?? send.error.message)
      : send.error
        ? tc('state.error.text')
        : null;
  return (
    <Modal
      title={t(action === 'verify_link' ? 'link_title' : 'create_title')}
      size="sm"
      isOpen
      onClose={onClose}
      dismissible={!send.isPending}
      secondaryAction={
        <Button variant="secondary" onPress={onClose} disabled={send.isPending}>
          {tc('action.cancel')}
        </Button>
      }
      primaryAction={
        <Button
          variant="primary"
          onPress={() => send.mutate()}
          disabled={!ready}
          loading={send.isPending}
        >
          {t(action === 'verify_link' ? 'confirm_link' : 'confirm_create')}
        </Button>
      }
    >
      <Stack gap={3}>
        {action === 'verify_link' ? (
          lookup.isPending ? (
            <Skeleton shape="text" />
          ) : lookup.data?.blocked ? (
            <Alert tone="danger">{t('blocked')}</Alert>
          ) : found ? (
            <>
              <Text weight="bold">{t('profile')}</Text>
              <DescriptionList
                labelWidth="md"
                items={[
                  { label: t('ben_no'), value: formatBenNo(found.benNo) },
                  { label: t('name'), value: found.name },
                  { label: t('father'), value: found.fatherOrHusbandName },
                ]}
              />
            </>
          ) : (
            <Alert tone="warning">{t('not_found')}</Alert>
          )
        ) : (
          <Text tone="muted">{t('create_help')}</Text>
        )}
        <Select
          label={t('owner')}
          helper={t('owner_help')}
          value={owner}
          options={(people.data ?? []).map((p) => ({ id: p.volunteerId, label: p.displayName }))}
          onChange={setOwner}
        />
        {failure ? <Alert tone="danger">{failure}</Alert> : null}
      </Stack>
    </Modal>
  );
}
