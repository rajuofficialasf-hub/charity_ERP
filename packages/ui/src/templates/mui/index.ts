// The MUI core implementation of the set's contract (src/contract.ts). Everything that
// imports MUI or Emotion lives in this folder; pages import "@css/ui" only.
import type { UiTemplate } from '../../contract.js';
import { Button } from './Button.js';
import { DateField } from './DateField.js';
import { Combobox, Select } from './Select.js';
import { RouterLink as Link, TemplateProvider } from './provider.js';

// A component missing here, or one whose props differ from the contract, fails the typecheck.
export const muiTemplate = {
  TemplateProvider,
  Link,
  Button,
  Select,
  Combobox,
  DateField,
} satisfies UiTemplate;

export { Button, Combobox, DateField, Link, Select, TemplateProvider };
export { createUiTheme, SPACING_PX } from './theme.js';
