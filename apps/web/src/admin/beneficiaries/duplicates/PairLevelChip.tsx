import { Chip } from '@/ui';
import { useTranslations } from 'use-intl';
import type { PairLevel } from './merge-api';

/**
 * How sure a suggested pair is, in words: probable where several facts agree, "to check" where
 * one weaker fact alone stands. The words carry the meaning; the tone only marks it.
 */
export function PairLevelChip({ level }: { level: PairLevel }) {
  const t = useTranslations('admin.beneficiaries.duplicates.level');
  return <Chip tone={level === 'probable' ? 'warning' : 'neutral'}>{t(level)}</Chip>;
}
