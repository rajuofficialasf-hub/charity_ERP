// The MUI core implementation of the set's contract (src/contract.ts). Everything that
// imports MUI or Emotion lives in this folder; pages import "@css/ui" only.
import type { UiTemplate } from '../../contract.js';
import { Button as SetButton } from './Button.js';
import { DateField as SetDateField } from './DateField.js';
import { MenuButton as SetMenuButton } from './Menu.js';
import {
  ConfirmDialog as SetConfirmDialog,
  Drawer as SetDrawer,
  Modal as SetModal,
} from './Overlay.js';
import { Combobox as SetCombobox, Select as SetSelect } from './Select.js';
import { inSetTheme, RouterLink as Link, TemplateProvider } from './provider.js';
import { Table as SetTable, TableToolbar as SetTableToolbar } from './Table.js';
import { Tabs as SetTabs } from './Tabs.js';

// Each MUI component of the set keeps the set's theme, also inside the newer UI system's provider.
const Button = inSetTheme(SetButton);
const DateField = inSetTheme(SetDateField);
const MenuButton = inSetTheme(SetMenuButton);
const ConfirmDialog = inSetTheme(SetConfirmDialog);
const Drawer = inSetTheme(SetDrawer);
const Modal = inSetTheme(SetModal);
const Combobox = inSetTheme(SetCombobox);
const Select = inSetTheme(SetSelect);
const Table = inSetTheme(SetTable) as typeof SetTable;
const TableToolbar = inSetTheme(SetTableToolbar);
const Tabs = inSetTheme(SetTabs);

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
