import { Alert, Stack } from '@css/ui';
import { useTranslations } from 'use-intl';
import type { OfficeApplication } from './applications-api';

/** The flags a public entry or a sync may carry, each with its own words. */
const KNOWN_FLAGS = [
  'public_entry',
  'existing_identity',
  'identity_blocked',
  'identity_repeated',
] as const;

/**
 * What the official should know before deciding: the flags of a public entry and the family
 * matches of the project (another applicant with the same mobile, or the same union, village and
 * father's or husband's name); each is a warning, never a refusal.
 */
export function Signals({ application: a }: { application: OfficeApplication }) {
  const t = useTranslations('applications.office.signals');
  const flags = a.flags.filter((f): f is (typeof KNOWN_FLAGS)[number] =>
    (KNOWN_FLAGS as readonly string[]).includes(f),
  );
  if (!flags.length && !a.familyDuplicateWarnings.length) return null;
  return (
    <Stack gap={2}>
      {flags.map((flag) => (
        <Alert key={flag} tone={flag === 'identity_blocked' ? 'danger' : 'warning'}>
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
    </Stack>
  );
}
