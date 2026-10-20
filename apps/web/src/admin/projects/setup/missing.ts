import type { ComponentKey } from '@css/shared';
import type { MissingItem } from '@css/shared/projects';
import { useTranslations } from 'use-intl';

/** The label of a missing activation item (the setup summary and a refused activation). */
export function useMissingLabel() {
  const t = useTranslations('admin.projects.setup');
  const tk = useTranslations('admin.projects.component');
  return (item: string) =>
    item.startsWith('component:')
      ? t('missing.component', { name: tk(item.slice('component:'.length) as ComponentKey) })
      : t(`missing.${item as Exclude<MissingItem, `component:${string}`>}`);
}
