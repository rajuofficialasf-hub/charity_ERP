import {
  formatBenNo,
  isBirthRegNumber,
  isNidNumber,
  normalizeIdentityNumber,
} from '@css/shared/beneficiaries';
import type { Locale } from '@css/shared/i18n';
import { Alert, Button, DescriptionList, Grid, Icon, Stack, TextField } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { type ReactNode, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import {
  type LookupAutofill,
  lookupBeneficiary,
  type LookupResult,
} from '../../admin/beneficiaries/beneficiaries-api';
import { useLocationName } from '../../components/AddressNames';
import { ApiFailure } from '../../api/client';
import { ChoiceButtons } from '../forms/ChoiceButtons';
import { QuestionTitle } from '../forms/QuestionTitle';
import './lookup.css';

type NumberKind = 'nid' | 'birthReg';
type Asked = { number: string; kind: NumberKind; projectId: string };

/**
 * The identity number of a beneficiary with its lookup inside one project: the official or the
 * volunteer types the NID or the birth registration (Bengali digits are accepted), presses
 * search, and sees the answer. A found profile fills the form: the name, the father's or
 * husband's name and the number are locked, the mobile stays editable. A blocked person, an
 * existing application in the project and the caller's own mobile each get their own message.
 * An answer belongs to the number, the kind and the project it was asked for: one that arrives
 * after any of them changed is dropped. A parent that lets the project change gives the field the
 * project as its `key`, so the answer it already received goes too.
 */
export function LookupField({
  projectId,
  onResult,
  footer,
}: {
  /** The project the application belongs to; the search waits until one is chosen. */
  projectId: string | null;
  /** Each answer, and null when the number changes; the mobile as the person edits it; the number asked. */
  onResult?: (result: LookupResult | null, mobile: string | null, number: string | null) => void;
  /** Extra content under a found profile (a link to the profile on an official's screen). */
  footer?: (autofill: LookupAutofill) => ReactNode;
}) {
  const t = useTranslations('admin.beneficiaries.lookup');
  const te = useTranslations('errors.validation');
  const [kind, setKind] = useState<NumberKind>('nid');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [mobile, setMobile] = useState('');
  const [asked, setAsked] = useState<Asked | null>(null);
  // without network the number is taken as a new person's; the office matches it when it arrives
  const [offline, setOffline] = useState(false);
  // the question in force, read by a response that may arrive after it changed
  const current = useRef<Asked | null>(null);
  const search = useMutation({
    mutationFn: (q: Asked) =>
      lookupBeneficiary(
        q.kind === 'nid'
          ? { nid: q.number, projectId: q.projectId }
          : { birthReg: q.number, projectId: q.projectId },
      ),
    onSuccess: (result, q) => {
      if (current.current !== q) return;
      const next = result.autofill?.mobile ?? '';
      setMobile(next);
      onResult?.(result, next || null, q.number);
    },
  });

  const reset = () => {
    setError(undefined);
    setOffline(false);
    if (!current.current) return;
    current.current = null;
    setAsked(null);
    search.reset();
    onResult?.(null, null, null);
  };
  const submit = () => {
    const number = normalizeIdentityNumber(typed);
    const valid = kind === 'nid' ? isNidNumber(number) : isBirthRegNumber(number);
    if (!valid) {
      setError(te(kind === 'nid' ? 'nid_format' : 'birth_reg_format'));
      return;
    }
    if (!projectId) return;
    const q = { number, kind, projectId };
    current.current = q;
    setTyped(number);
    setAsked(q);
    if (!navigator.onLine) {
      setOffline(true);
      search.reset();
      onResult?.({ found: false }, null, number);
      return;
    }
    search.mutate(q);
  };

  const fresh = !!asked && asked.projectId === projectId && search.variables === asked;
  const result = fresh ? search.data : undefined;
  const failure = fresh && search.error instanceof ApiFailure ? search.error : null;
  return (
    <Stack gap={3}>
      {/* the kind as two large buttons: one is always chosen (D-166) */}
      <ChoiceButtons
        id="lookup-kind"
        label={t('kind')}
        required={false}
        value={[kind]}
        options={[
          { value: 'nid', label: t('kind_nid') },
          { value: 'birthReg', label: t('kind_birth_reg') },
        ]}
        onChange={(codes) => {
          if (!codes[0]) return;
          setKind(codes[0] as NumberKind);
          reset();
        }}
      />
      <TextField
        type="nid"
        label={kind === 'nid' ? t('number_nid') : t('number_birth_reg')}
        hint={projectId ? undefined : t('pick_project')}
        value={typed}
        error={error}
        maxLength={40}
        onChange={(value) => {
          setTyped(value);
          reset();
        }}
        endAction={
          <Button
            size="small"
            startIcon="search"
            onClick={submit}
            disabled={!projectId || !typed.trim()}
            loading={search.isPending}
          >
            {t('search')}
          </Button>
        }
      />
      {failure && <Alert tone="error">{failure.message}</Alert>}
      {offline && asked && <Alert tone="info">{t('offline_note')}</Alert>}
      {result && asked && !offline && (
        <Answer
          result={result}
          number={asked.number}
          kind={asked.kind}
          mobile={mobile}
          onMobile={(value) => {
            setMobile(value);
            onResult?.(result, value || null, asked?.number ?? null);
          }}
          footer={footer}
        />
      )}
    </Stack>
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
  // a blocked person cannot apply anywhere (the answer carries nothing else), and one
  // application per project is the rule
  if (result.found && result.blocked) return <Alert tone="error">{t('blocked')}</Alert>;
  if (!result.found || !a)
    return (
      <div className="lookup-card is-new" role="status">
        <span className="lookup-card-mark" aria-hidden="true">
          <Icon name="user-add" size={22} />
        </span>
        <span className="lookup-card-text">
          <strong>{t('new_person')}</strong>
          <span>{t('not_found')}</span>
        </span>
      </div>
    );
  if (result.alreadyAppliedInProject)
    return <Alert tone="warning">{t('already_applied', { benNo: formatBenNo(a.benNo) })}</Alert>;
  return (
    <Stack gap={3}>
      <div className="lookup-card is-found">
        <span className="lookup-card-mark" aria-hidden="true">
          <Icon name="user-check" size={22} />
        </span>
        <span className="lookup-card-text">
          <span className="lookup-card-ben">{formatBenNo(a.benNo)}</span>
          <strong>{a.name}</strong>
          <span>{a.fatherOrHusbandName}</span>
        </span>
      </div>
      {result.mergedInto && (
        <Alert tone="info">{t('merged', { benNo: formatBenNo(result.mergedInto.benNo) })}</Alert>
      )}
      <QuestionTitle>{t('found', { benNo: formatBenNo(a.benNo) })}</QuestionTitle>
      <Grid columns={{ base: 1, sm: 2 }} gap={3}>
        {/* the identity of a known person changes only through a correction */}
        <TextField label={t('name')} value={a.name} locked onChange={() => undefined} />
        <TextField
          label={t('father')}
          value={a.fatherOrHusbandName}
          locked
          onChange={() => undefined}
        />
        <TextField
          label={kind === 'nid' ? t('number_nid') : t('number_birth_reg')}
          value={number}
          locked
          onChange={() => undefined}
        />
        <TextField
          type="tel"
          label={t('mobile')}
          value={mobile}
          onChange={onMobile}
          error={result.mobileIsCallerOwn && mobile === a.mobile ? t('own_mobile') : undefined}
        />
      </Grid>
      <Details autofill={a} />
      {footer?.(a)}
    </Stack>
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
