// The asf implementation of the UI contract (src/ui/contract.ts): the org's own design for admin
// dashboards and public pages, on MUI core. It implements the extended set, so pages may use
// Tabs, Card, DataTable pagination, PublicShell and the rest (see the template's REGISTRY.md).
import type { UiTemplateExtended } from '@/ui/contract';

import * as components from './components';

// A component missing from ./components, or one whose props differ from the contract, fails the
// type check on this line.
export const asfTemplate = components satisfies UiTemplateExtended;

export * from './components';
