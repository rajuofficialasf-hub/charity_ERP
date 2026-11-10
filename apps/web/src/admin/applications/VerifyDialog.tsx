import { answerValueSchema } from '@css/shared';
import { formatBenNo } from '@css/shared/beneficiaries';
import { identityColumn } from '@css/shared/forms';
import {
  Alert,
  Button,
  DescriptionList,
  Dialog,
  Form,
  FormSelectField,
  Skeleton,
  Text,
} from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import { lookupBeneficiary } from '../beneficiaries/beneficiaries-api';
import { assignments, volunteersKey } from '../projects/volunteers/project-volunteers-api';
import { type OfficeApplication, officeAct } from './applications-api';
import { LoadError } from '../../components/LoadError';

/** The volunteer who takes the application, or none: it stays the office's. */
const VERIFY_SCHEMA = z.object({ ownerVolunteerId: z.string() });
type VerifyFields = z.infer<typeof VERIFY_SCHEMA>;

/** The identity number the entry gave, read from its answer. */
function numberOf(a: OfficeApplication): string | null {
  const field = a.form.sections
    .flatMap((s) => s.fields)
    .find((f) => f.standardColumn === 'nid_or_birth_reg');
  const answer = field ? a.answers.find((x) => x.fieldKey === field.fieldKey) : undefined;
  const parsed = answer ? answerValueSchema.safeParse(answer.value) : undefined;
  const value = parsed?.success && 'v' in parsed.data ? parsed.data.v : undefined;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Every volunteer of the project, page by page. */
async function allVolunteers(projectId: string) {
  const rows = [];
  let cursor: string | null = null;
  do {
    const page = await assignments(projectId, cursor);
    rows.push(...page.data);
    cursor = page.meta.nextCursor;
  } while (cursor);
  return rows;
}

/**
 * The verification of a public or offline entry: the entry's number is looked up now, through the
 * audited lookup. A profile that holds it is shown with the lookup's own fields (never the whole
 * profile) and the entry is linked to it; without one a new profile is made from the entry; a
 * blocked person's entry can only be refused, which the record's own button does. Either way the
 * application may take a volunteer of the project as its owner, or stay the office's.
 */
export function VerifyDialog({
  application: a,
  etag,
  onClose,
  onDone,
}: {
  application: OfficeApplication;
  etag: string;
  onClose: () => void;
  onDone: (action: 'verify_link' | 'verify_create') => Promise<unknown> | void;
}) {
  const t = useTranslations('applications.office.verify');
  const tc = useTranslations('common');
  const number = numberOf(a);
  const form = useForm<VerifyFields>({
    resolver: useSchemaResolver(VERIFY_SCHEMA),
    defaultValues: { ownerVolunteerId: '' },
    reValidateMode: 'onSubmit',
  });
  const pending = form.formState.isSubmitting;
  const error = form.formState.errors.root?.server?.message;
  const lookup = useQuery({
    queryKey: ['admin', 'verify-lookup', a.id, number],
    queryFn: () =>
      lookupBeneficiary(
        identityColumn(number ?? '') === 'nid'
          ? { nid: number ?? '', projectId: a.projectId }
          : { birthReg: number ?? '', projectId: a.projectId },
      ),
    enabled: Boolean(number),
  });
  const people = useQuery({
    queryKey: [...volunteersKey(a.projectId), 'verify'],
    queryFn: () => allVolunteers(a.projectId),
  });
  const blocked = Boolean(lookup.data?.blocked);
  const found = lookup.data?.found && !blocked ? lookup.data.autofill : undefined;
  // the lookup decides: a known number links, an unknown one makes the profile
  const action: 'verify_link' | 'verify_create' | null = !number
    ? 'verify_create'
    : lookup.data
      ? blocked
        ? null
        : found
          ? 'verify_link'
          : 'verify_create'
      : null;
  const send = async ({ ownerVolunteerId }: VerifyFields) => {
    if (!action) return;
    try {
      await officeAct(a.id, etag, action, {
        ...(action === 'verify_link' && found ? { linkBeneficiaryId: found.beneficiaryId } : {}),
        ...(ownerVolunteerId ? { ownerVolunteerId } : {}),
      });
      await onDone(action);
    } catch (failure) {
      showFailure(form, failure, tc('state.error.text'));
    }
  };
  return (
    <Dialog
      title={t('title')}
      size="small"
      open
      onClose={onClose}
      dismissible={!pending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {tc('action.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => void form.handleSubmit(send)()}
            disabled={!action || people.isError}
            loading={pending}
          >
            {t(action === 'verify_create' ? 'confirm_create' : 'confirm_link')}
          </Button>
        </>
      }
    >
      <Form form={form} onSubmit={send} label={t('title')} error={error}>
        {number && lookup.isPending ? (
          <Skeleton shape="text" />
        ) : lookup.isError ? (
          <LoadError error={lookup.error} onRetry={() => void lookup.refetch()} />
        ) : blocked ? (
          <Alert tone="error">{t('blocked')}</Alert>
        ) : found ? (
          <>
            <Text>
              <strong>{t('profile')}</strong>
            </Text>
            <DescriptionList
              items={[
                { label: t('ben_no'), value: formatBenNo(found.benNo) },
                { label: t('name'), value: found.name },
                { label: t('father'), value: found.fatherOrHusbandName },
              ]}
            />
          </>
        ) : (
          <Text tone="muted">{t('create_help')}</Text>
        )}
        {people.isError ? (
          <LoadError error={people.error} onRetry={() => void people.refetch()} />
        ) : (
          <FormSelectField
            name="ownerVolunteerId"
            label={t('owner')}
            hint={t('owner_help')}
            options={(people.data ?? []).map((p) => ({
              value: p.volunteerId,
              label: p.displayName,
            }))}
          />
        )}
      </Form>
    </Dialog>
  );
}
