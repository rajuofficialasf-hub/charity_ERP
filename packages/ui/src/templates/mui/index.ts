// The MUI core implementation of the set's contract (src/contract.ts, ADR-015). Everything that
// imports MUI or Emotion lives in this folder; pages import "@css/ui" only.
import type { UiTemplate } from '../../contract.js';
import { TemplateProvider } from './provider.js';

// A component missing here, or one whose props differ from the contract, fails the typecheck.
export const muiTemplate = { TemplateProvider } satisfies UiTemplate;

export { TemplateProvider };
export { createUiTheme, SPACING_PX } from './theme.js';
