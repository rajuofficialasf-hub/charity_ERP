import type { Locale } from '@css/shared/i18n';
import { Alert, Stack } from '@/ui';
import { Link } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { comparePath } from '../beneficiaries/duplicates/merge-api';
import type { OfficeApplication } from './applications-api';

/** The flags that name a blocked person: drawn as an error, the others as a warning. */
const BLOCK_FLAGS: readonly string[] = ['identity_blocked', 'blocked_name_match'];

/** The flags an entry that waits for verification may carry, each with its own words. */
const KNOWN_FLAGS = [
  'public_entry',
  'existing_identity',
  'identity_blocked',
  'blocked_name_match',
  'identity_repeated',
  'late_sync',
  'stale_form_version',
] as const;

/**
 * What the official should know before deciding: the flags of a public entry, the family
 * matches of the project (another applicant with the same mobile, or the same union, village and
 * father's or husband's name), the earlier family that probably holds the applicant as a member,
 * and an open probable pair of the person with another profile. Each is a warning, never a
 * refusal; another profile is named and linked only where the server named it for this viewer.
 */
export function Signals({ application: a }: { application: OfficeApplication }) {
  const t = useTranslations('applications.office.signals');
  const tr = useTranslations('admin.beneficiaries.duplicates.rules');
  const locale = useLocale() as Locale;
  const flags = a.flags.filter((f): f is (typeof KNOWN_FLAGS)[number] =>
    (KNOWN_FLAGS as readonly string[]).includes(f),
  );
  const members = a.familyMemberSignals;
  const pairs = a.samePersonSignals;
  if (!flags.length && !a.familyDuplicateWarnings.length && !members.length && !pairs.length)
    return null;
  return (
    <Stack gap={2}>
      {flags.map((flag) => (
        <Alert key={flag} tone={BLOCK_FLAGS.includes(flag) ? 'error' : 'warning'}>
          {t(`flag.${flag}`)}
        </Alert>
      ))}
      {a.familyDuplicateWarnings.map((w) => (
        <Alert key={w.beneficiaryId} tone="warning">
          {t('family', {
            name: w.name,
            benNo: w.benNo,
            rule: w.matchedOn.map((r) => t(`rule.${r}`)).join(', '),
          })}
        </Alert>
      ))}
      {members.map((m, i) => {
        const words = locale === 'en' ? m.relationship?.en : m.relationship?.bn;
        const relationship = words ?? t('family_member.relative');
        return (
          <Alert key={m.head?.beneficiaryId ?? `member-${i}`} tone="warning">
            {m.head ? (
              <>
                {t('family_member.named', { head: m.head.name, relationship })}{' '}
                <Link to={`/admin/beneficiaries/${m.head.beneficiaryId}`}>
                  {t('family_member.open', { benNo: m.head.benNo })}
                </Link>
              </>
            ) : (
              t('family_member.unnamed')
            )}
          </Alert>
        );
      })}
      {pairs.map((p, i) => {
        const rule = p.matchedOn.map((r) => tr(r)).join(', ');
        return (
          <Alert key={p.other?.beneficiaryId ?? `pair-${i}`} tone="warning">
            {p.other && a.beneficiaryId ? (
              <>
                {t('same_person.named', {
                  name: p.other.name,
                  benNo: p.other.benNo,
                  rule,
                })}{' '}
                <Link to={comparePath(a.beneficiaryId, p.other.beneficiaryId)}>
                  {t('same_person.compare')}
                </Link>
              </>
            ) : (
              t('same_person.unnamed', { rule })
            )}
          </Alert>
        );
      })}
    </Stack>
  );
}
