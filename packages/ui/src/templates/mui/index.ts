// The MUI core implementation of the set's contract (src/contract.ts). Everything that
// imports MUI or Emotion lives in this folder; pages import "@css/ui" only.
import type { UiTemplate } from '../../contract.js';
import { Button } from './Button.js';
import { DateField } from './DateField.js';
import { MenuButton } from './Menu.js';
import { ConfirmDialog, Drawer, Modal } from './Overlay.js';
import { Combobox, Select } from './Select.js';
import { RouterLink as Link, TemplateProvider } from './provider.js';
import { Table, TableToolbar } from './Table.js';
import { Tabs } from './Tabs.js';

// A component missing here, or one whose props differ from the contract, fails the typecheck.
export const muiTemplate = {
  TemplateProvider,
  Link,
  Button,
  Select,
  Combobox,
  DateField,
  Modal,
  Drawer,
  ConfirmDialog,
  MenuButton,
  Tabs,
  Table,
  TableToolbar,
} satisfies UiTemplate;

export {
  Button,
  Combobox,
  ConfirmDialog,
  DateField,
  Drawer,
  Link,
  MenuButton,
  Modal,
  Select,
  Table,
  TableToolbar,
  Tabs,
  TemplateProvider,
};
export { createUiTheme, SPACING_PX } from './theme.js';
