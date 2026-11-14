import { type Locale, localized } from '@css/shared/i18n';
import { Alert, Button, Heading, Stack, Text, TextField } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { ApiFailure } from '../../api/client';
import { type Address, AddressFields, EMPTY_ADDRESS } from '../registration/AddressFields';
import { type MatchPerson, matchPeople } from './applications-api';
import type { TypedPerson } from './identity-answers';

/** What the volunteer settled on: a person already here, a new person, or no lookup for want of network. */
export type NameMatchChoice =
  | { kind: 'picked'; typed: TypedPerson; person: MatchPerson; pickToken: string }
  | { kind: 'new'; typed: TypedPerson }
  | { kind: 'offline' };

/** A failure that never reached the server: the phone has no network. */
const unreached = (error: unknown) => !(error instanceof ApiFailure) || error.status === 0;

/**
 * The people already here under a name (docs/ui/SCREENS.md, "New application with NID lookup"):
 * before a person without a document is taken as new, the volunteer types the name, the father's
 * or husband's name, the union and the village and searches; the server shows at most five people
 * with those keys in that union (and says when there are more), each with the years of help, and
 * the volunteer picks one ("ইনিই") or says it is a new person; a person who cannot be picked here
 * keeps the button disabled under one neutral line. The rows are kept in this screen's memory only. Without network the
 * lookup is left out and the form starts as for a new person; the office compares at the send.
 */
export function NameMatch({
  projectId,
  onChoose,
}: {
  projectId: string;
  onChoose: (choice: NameMatchChoice) => void;
}) {
  const t = useTranslations('applications.new.match');
  const te = useTranslations('errors.validation');
  const locale = useLocale() as Locale;
  const [name, setName] = useState('');
  const [father, setFather] = useState('');
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [village, setVillage] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  // the question the shown answer belongs to; a change of any part drops the answer
  const [asked, setAsked] = useState<TypedPerson | null>(null);
  const search = useMutation({
    mutationFn: (q: TypedPerson) =>
      matchPeople({
        projectId,
        name: q.name,
        fatherOrHusbandName: q.fatherOrHusbandName,
        unionId: q.address.unionId,
        village: q.village,
      }),
    onError: (error) => {
      if (unreached(error)) onChoose({ kind: 'offline' });
    },
  });
  const changed = () => {
    setAsked(null);
    search.reset();
  };
  const submit = () => {
    const required = te('required');
    const next = {
      name: name.trim() ? undefined : required,
      father: father.trim() ? undefined : required,
      unionId: address.unionId ? undefined : required,
      village: village.trim() ? undefined : required,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    if (!navigator.onLine) {
      onChoose({ kind: 'offline' });
      return;
    }
    const q: TypedPerson = {
      name: name.trim(),
      fatherOrHusbandName: father.trim(),
      address: {
        divisionId: address.divisionId!,
        districtId: address.districtId!,
        upazilaId: address.upazilaId!,
        unionId: address.unionId!,
      },
      village: village.trim(),
    };
    setAsked(q);
    search.mutate(q);
  };
  const failure =
    search.error instanceof ApiFailure && !unreached(search.error) ? search.error : null;
  const found = asked && search.data ? search.data : null;
  const startNew = (label: string) =>
    asked ? (
      <Button variant="secondary" fullWidth onClick={() => onChoose({ kind: 'new', typed: asked })}>
        {label}
      </Button>
    ) : null;
  return (
    <section aria-label={t('section')}>
      <Stack gap={3}>
        <Text tone="muted">{t('help')}</Text>
        <TextField
          label={t('name')}
          value={name}
          error={errors.name}
          maxLength={200}
          onChange={(v) => {
            setName(v);
            changed();
          }}
        />
        <TextField
          label={t('father')}
          value={father}
          error={errors.father}
          maxLength={200}
          onChange={(v) => {
            setFather(v);
            changed();
          }}
        />
        <AddressFields
          value={address}
          errors={{ unionId: errors.unionId }}
          onChange={(next) => {
            setAddress(next);
            changed();
          }}
        />
        <TextField
          label={t('village')}
          value={village}
          error={errors.village}
          maxLength={200}
          onChange={(v) => {
            setVillage(v);
            changed();
          }}
        />
        <Button variant="primary" startIcon="search" onClick={submit} loading={search.isPending}>
          {t('search')}
        </Button>
        {failure ? (
          <Stack gap={2}>
            <Alert tone="error">{failure.status === 403 ? t('outside') : failure.message}</Alert>
            {failure.status === 403 ? null : startNew(t('start_new'))}
          </Stack>
        ) : null}
        {found && found.people.length === 0 ? (
          <Stack gap={2}>
            <div role="status">
              <Text>{t('nobody')}</Text>
            </div>
            {startNew(t('start_new'))}
          </Stack>
        ) : null}
        {found && found.people.length > 0 && asked ? (
          <Stack gap={2}>
            <Heading level={3}>{t('found_title')}</Heading>
            <ul className="apply-match-list">
              {found.people.map((person, i) => (
                <li key={person.pickToken ?? `unpickable-${i}`} className="apply-match-row">
                  <span className="apply-match-name">{person.name}</span>
                  <Text size="small">{t('father_line', { name: person.fatherOrHusbandName })}</Text>
                  <Text size="small">{t('village_line', { village: person.village })}</Text>
                  {person.helpedYears.length ? (
                    <Text size="small">
                      {t('helped', { years: person.helpedYears.map(String).join(', ') })}
                    </Text>
                  ) : null}
                  {person.projects.length ? (
                    <Text size="small" tone="muted">
                      {t('projects', {
                        projects: person.projects.map((p) => localized(p.name, locale)).join(', '),
                      })}
                    </Text>
                  ) : null}
                  {!person.pickable || !person.pickToken ? (
                    <>
                      {/* one neutral line: why the person cannot be picked here is not said */}
                      <Button variant="primary" disabled>
                        {t('pick')}
                      </Button>
                      <Text tone="muted">{t('not_pickable')}</Text>
                    </>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() =>
                        onChoose({
                          kind: 'picked',
                          typed: asked,
                          person,
                          pickToken: person.pickToken!,
                        })
                      }
                    >
                      {t('pick')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {/* the count stops one past the people shown: there are more, never how many */}
            {found.total > found.people.length ? (
              <Text size="small" tone="muted">
                {t('more')}
              </Text>
            ) : null}
            {startNew(t('none_of_them'))}
          </Stack>
        ) : null}
      </Stack>
    </section>
  );
}
