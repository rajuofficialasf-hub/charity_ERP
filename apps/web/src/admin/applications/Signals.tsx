import type { Locale } from '@css/shared/i18n';
import { Alert, Stack, Text } from '@/ui';
import { Link } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { comparePath } from '../beneficiaries/duplicates/merge-api';
import { PairLevelChip } from '../beneficiaries/duplicates/PairLevelChip';
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

/** The repeats a project may hold; where it does, the approval asks a reason. */
const HELD_REASONS = ['same_person', 'family_match'] as const;

/**
 * What the official should know before deciding: the flags of a public entry, the family
 * matches of the project (another applicant with the same mobile, or the same union, village and
 * father's or husband's name), the earlier family that probably holds the applicant as a member,
 * an open probable pair of the person with another profile, each with its level, and the same
 * person's other application in the project on a merged profile. Each is a
 * warning, never a refusal; another profile is named and linked only where the server named it for
 * this viewer, and the entries beyond those listed are counted. Where the project holds a repeat
 * the approval meets, a line says that the approval asks a reason.
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
  const moreMembers = a.familyMemberSignalsTotal - members.length;
  const morePairs = a.samePersonSignalsTotal - pairs.length;
  // the repeats this project holds: the approval will ask a reason, which the server named
  const held = HELD_REASONS.filter((r) =>
    Object.values(a.decisionHints).some((reasons) => reasons?.includes(r)),
  );
  const twins = a.mergedTwins;
  if (
    !flags.length &&
    !a.familyDuplicateWarnings.length &&
    !members.length &&
    !pairs.length &&
    !twins.length &&
    !held.length
  )
    return null;
  const nameOf = (words: { bn: string; en: string }) => (locale === 'en' ? words.en : words.bn);
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
      {members.map((m, i) => (
        <Alert key={'head' in m ? m.head.beneficiaryId : `member-${i}`} tone="warning">
          <Stack direction="row" gap={1} align="center" wrap>
            <PairLevelChip level={m.level} />
            {'head' in m ? (
              <span>
                {t('family_member.named', {
                  head: m.head.name,
                  relationship: m.relationships.length
                    ? m.relationships
                        .map((r) => (r.name ? nameOf(r.name) : t('family_member.relative')))
                        .join(` ${t('family_member.or')} `)
                    : t('family_member.relative'),
                })}{' '}
                <Link to={`/admin/beneficiaries/${m.head.beneficiaryId}`}>
                  {t('family_member.open', { benNo: m.head.benNo })}
                </Link>
              </span>
            ) : (
              <span>{t('family_member.unnamed')}</span>
            )}
          </Stack>
        </Alert>
      ))}
      {moreMembers > 0 && <Text size="small">{t('family_member.more', { n: moreMembers })}</Text>}
      {pairs.map((p, i) => (
        <Alert key={'other' in p ? p.other.beneficiaryId : `pair-${i}`} tone="warning">
          <Stack direction="row" gap={1} align="center" wrap>
            <PairLevelChip level={p.level} />
            {'other' in p && a.beneficiaryId ? (
              <span>
                {t('same_person.named', {
                  name: p.other.name,
                  benNo: p.other.benNo,
                  rule: p.matchedOn.map((r) => tr(r)).join(', '),
                })}{' '}
                <Link to={comparePath(a.beneficiaryId, p.other.beneficiaryId)}>
                  {t('same_person.compare')}
                </Link>
              </span>
            ) : (
              <span>{t('same_person.unnamed')}</span>
            )}
          </Stack>
        </Alert>
      ))}
      {morePairs > 0 && <Text size="small">{t('same_person.more', { n: morePairs })}</Text>}
      {twins.map((twin, i) => (
        <Alert key={twin.applicationId ?? `twin-${i}`} tone="warning">
          {twin.applicationId && twin.appNo ? (
            <span>
              {t('merged_twin.named', { appNo: twin.appNo })}{' '}
              <Link to={`/admin/applications/${twin.applicationId}`}>{t('merged_twin.open')}</Link>
            </span>
          ) : (
            <span>{t('merged_twin.unnamed')}</span>
          )}
        </Alert>
      ))}
      {held.map((reason) => (
        <Text key={reason} size="small" tone="muted">
          {t(`held.${reason}`)}
        </Text>
      ))}
    </Stack>
  );
}
