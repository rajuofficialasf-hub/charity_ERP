import type { ComponentKey } from '@css/shared';
import type { MissingItem, RulesPart } from '@css/shared/projects';
import { useTranslations } from 'use-intl';

/** The label of a missing activation item (the setup summary and a refused activation). */
export function useMissingLabel() {
  const t = useTranslations('admin.projects.setup');
  const tk = useTranslations('admin.projects.component');
  const tr = useTranslations('admin.projects.rules_part');
  return (item: string) =>
    item.startsWith('component:')
      ? t('missing.component', { name: tk(item.slice('component:'.length) as ComponentKey) })
      : item.startsWith('rules:')
        ? t('missing.rules', { part: tr(item.slice('rules:'.length) as RulesPart) })
        : t(`missing.${item as Exclude<MissingItem, `component:${string}` | `rules:${string}`>}`);
}
