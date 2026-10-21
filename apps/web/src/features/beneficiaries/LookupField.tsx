import {
  formatBenNo,
  isBirthRegNumber,
  isNidNumber,
  normalizeIdentityNumber,
} from '@css/shared/beneficiaries';
import type { Locale } from '@css/shared/i18n';
import {
  Alert,
  Button,
  DescriptionList,
  Grid,
  PhoneField,
  RadioGroup,
  Text,
  TextField,
} from '@css/ui';
import { useMutation } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import {
  type LookupAutofill,
  lookupBeneficiary,
  type LookupResult,
} from '../../admin/beneficiaries/beneficiaries-api';
import { useLocationName } from '../../components/AddressNames';
import { ApiFailure } from '../../lib/api';

type NumberKind = 'nid' | 'birthReg';

/**
 * The identity number of a beneficiary with its lookup inside one project: the official or the
 * volunteer types the NID or the birth registration (Bengali digits are accepted), presses
 * search, and sees the answer. A found profile fills the form: the name, the father's or
 * husband's name and the number are locked, the mobile stays editable. A blocked person, an
 * existing application in the project and the caller's own mobile each get their own message.
 */
export function LookupField({
  projectId,
  onResult,
  footer,
}: {
  /** The project the application belongs to; the search waits until one is chosen. */
  projectId: string | null;
  /** Each answer, and null when the number changes; the mobile as the person edits it. */
  onResult?: (result: LookupResult | null, mobile: string | null) => void;
  /** Extra content under a found profile (a link to the profile on an official's screen). */
  footer?: (autofill: LookupAutofill) => ReactNode;
}) {
  const t = useTranslations('admin.beneficiaries.lookup');
  const te = useTranslations('errors.validation');
  const [kind, setKind] = useState<NumberKind>('nid');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [mobile, setMobile] = useState('');
  const [searched, setSearched] = useState<string | null>(null);
  const search = useMutation({
    mutationFn: (number: string) =>
      lookupBeneficiary(
        kind === 'nid'
          ? { nid: number, projectId: projectId! }
          : { birthReg: number, projectId: projectId! },
      ),
    onSuccess: (result) => {
      const next = result.autofill?.mobile ?? '';
      setMobile(next);
      onResult?.(result, next || null);
    },
  });

  const reset = () => {
    setError(undefined);
    if (search.data || search.error) {
      search.reset();
      setSearched(null);
      onResult?.(null, null);
    }
  };
  const submit = () => {
    const number = normalizeIdentityNumber(typed);
    const valid = kind === 'nid' ? isNidNumber(number) : isBirthRegNumber(number);
    if (!valid) {
      setError(te(kind === 'nid' ? 'nid_format' : 'birth_reg_format'));
      return;
    }
    setTyped(number);
    setSearched(number);
    search.mutate(number);
  };

  const result = search.data;
  const failure = search.error instanceof ApiFailure ? search.error : null;
  return (
    <Grid gap={3}>
      <RadioGroup
        label={t('kind')}
        orientation="horizontal"
        value={kind}
        options={[
          { id: 'nid', label: t('kind_nid') },
          { id: 'birthReg', label: t('kind_birth_reg') },
        ]}
        onChange={(id) => {
          setKind(id as NumberKind);
          reset();
        }}
      />
      <TextField
        type="nid"
        label={kind === 'nid' ? t('number_nid') : t('number_birth_reg')}
        helper={projectId ? undefined : t('pick_project')}
        value={typed}
        error={error}
        maxLength={40}
        onChange={(value) => {
          setTyped(value);
          reset();
        }}
        endAction={
          <Button
            size="sm"
            icon={Search}
            onPress={submit}
            disabled={!projectId || !typed.trim()}
            loading={search.isPending}
          >
            {t('search')}
          </Button>
        }
      />
      {failure && (
        <Alert tone="danger" live="alert">
          {failure.message}
        </Alert>
      )}
      {result && searched && (
        <Answer
          result={result}
          number={searched}
          kind={kind}
          mobile={mobile}
          onMobile={(value) => {
            setMobile(value);
            onResult?.(result, value || null);
          }}
          footer={footer}
        />
      )}
    </Grid>
  );
}

function Answer({
  result,
  number,
  kind,
  mobile,
  onMobile,
  footer,
}: {
  result: LookupResult;
  number: string;
  kind: NumberKind;
  mobile: string;
  onMobile: (value: string) => void;
  footer?: (autofill: LookupAutofill) => ReactNode;
}) {
  const t = useTranslations('admin.beneficiaries.lookup');
  const a = result.autofill;
  if (!result.found || !a)
    return (
      <Alert tone="info" live="status">
        {t('not_found')}
      </Alert>
    );
  // a blocked person cannot apply anywhere, and one application per project is the rule
  if (result.blocked)
    return (
      <Alert tone="danger" live="status">
        {t('blocked')}
      </Alert>
    );
  if (result.alreadyAppliedInProject)
    return (
      <Alert tone="warning" live="status">
        {t('already_applied', { benNo: formatBenNo(a.benNo) })}
      </Alert>
    );
  return (
    <Grid gap={3}>
      {result.mergedInto && (
        <Alert tone="info" live="status">
          {t('merged', { benNo: formatBenNo(result.mergedInto.benNo) })}
        </Alert>
      )}
      <Text weight="bold">{t('found', { benNo: formatBenNo(a.benNo) })}</Text>
      <Grid columns={2} gap={3}>
        <TextField label={t('name')} value={a.name} locked />
        <TextField label={t('father')} value={a.fatherOrHusbandName} locked />
        <TextField
          label={kind === 'nid' ? t('number_nid') : t('number_birth_reg')}
          value={number}
          locked
        />
        <PhoneField
          label={t('mobile')}
          value={mobile}
          onChange={onMobile}
          error={result.mobileIsCallerOwn && mobile === a.mobile ? t('own_mobile') : undefined}
        />
      </Grid>
      <Details autofill={a} />
      {footer?.(a)}
    </Grid>
  );
}

/** The rest of the auto-fill, as the form will receive it. */
function Details({ autofill: a }: { autofill: LookupAutofill }) {
  const t = useTranslations('admin.beneficiaries.lookup');
  const tb = useTranslations('admin.beneficiaries');
  const locale = useLocale() as Locale;
  const names = [
    useLocationName(a.upazilaId, a.unionId),
    useLocationName(a.districtId, a.upazilaId),
    useLocationName(a.divisionId, a.districtId),
  ]
    .map((n) => n?.[locale])
    .filter(Boolean)
    .join(', ');
  const empty = tb('none');
  return (
    <DescriptionList
      items={[
        { label: t('mother'), value: a.motherName ?? empty },
        {
          label: t('gender'),
          value: ['female', 'male', 'other'].includes(a.genderCode)
            ? tb(`gender.${a.genderCode as 'female'}`)
            : a.genderCode,
        },
        { label: t('age'), value: a.ageYears ?? empty },
        { label: t('village'), value: a.village },
        { label: t('area'), value: names || empty },
      ]}
    />
  );
}
