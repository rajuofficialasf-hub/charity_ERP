import { orCached } from '../../lib/or-cached';
import { myApplications } from './applications-api';
import { type Tab, TABS } from './status';
import { loadStore } from './use-local-records';

/** The tabs of the own applications, in their order. */
export const TAB_IDS = Object.keys(TABS) as Tab[];

/**
 * The own applications of one tab: from the server while there is network and from the phone's
 * data set otherwise. The own list and the home's counts read it under the same key.
 */
export const ownListOf = (tab: Tab) =>
  orCached(
    () => myApplications(TABS[tab].join(',')),
    async () => {
      const cached = await (await loadStore()).cachedList(TABS[tab]);
      return cached ? { data: cached, meta: { total: cached.length } } : null;
    },
  );
