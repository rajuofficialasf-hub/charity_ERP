import type {
  AnchorHTMLAttributes,
  ComponentType,
  ReactElement,
  ReactNode,
  RefAttributes,
} from 'react';
import type { FieldBaseProps } from './components/Field/FieldParts.js';
import type { IconComponent } from './components/Icon/Icon.js';

/**
 * The contract of the component set (the organization's UI rules, recorded in
 * docs/architecture/ADR/ADR-015-mui-core-component-set.md): the props every template implements. Pages see these types through `@css/ui`; the template in
 * src/templates/<name>/ imports them with `import type` and checks itself with
 * `satisfies UiTemplate`, so a template that misses a component or changes its props fails the
 * typecheck. A component's props move here when its implementation moves into the template.
 */

/** The template's own provider: theme, styles and client-side links. */
export interface TemplateProviderProps {
  /** Client-side navigation for same-site links. */
  navigate?: ((href: string) => void) | undefined;
  children: ReactNode;
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  /** primary (one per region), secondary, ghost (tertiary and row actions), danger. */
  variant?: ButtonVariant;
  /** md: 44 px on phones, 40 px on desktop; sm: 36/32 px with a 44 px hit area on phones. */
  size?: 'md' | 'sm';
  icon?: IconComponent;
  iconPosition?: 'start' | 'end';
  /** Shows only the icon; the children become the accessible name (visually hidden). */
  iconOnly?: boolean;
  /**
   * A spinner replaces the start icon and the label stays; the button stays focusable, is marked
   * busy and disabled for assistive technology, and ignores presses.
   */
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  type?: 'button' | 'submit';
  onPress?: () => void;
  /** Renders a link styled as a button; only for navigation. */
  href?: string;
  autoFocus?: boolean;
  /** Layout only (margin, grid placement); never colours or typography. */
  className?: string;
  'aria-describedby'?: string;
  children: ReactNode;
}

export interface SelectOption {
  id: string;
  label: string;
  disabled?: boolean;
}

/** An "other" option opens a text box inside the same field (অন্যান্য). */
export interface OtherOptionProps {
  /** Id of the option that means "other". */
  otherOptionId?: string;
  otherValue?: string;
  onOtherChange?: (value: string) => void;
}

export interface SelectProps extends FieldBaseProps, OtherOptionProps {
  options: SelectOption[];
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (id: string | null) => void;
  placeholder?: string;
  /** Search box in the list; on by default when there are more than 10 options. */
  searchable?: boolean;
}

export interface ComboboxProps extends FieldBaseProps {
  options: SelectOption[];
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (id: string | null) => void;
  placeholder?: string;
  /** Allows text that is not one of the options (reported through onInputChange). */
  allowsCustomValue?: boolean;
  onInputChange?: (text: string) => void;
  /**
   * Options come from a server search on the typed text: they are not filtered again here, and
   * the list stays open while it is empty, so it fills when the answer arrives.
   */
  serverSearch?: boolean;
}

export interface DateFieldProps extends FieldBaseProps {
  /** ISO date yyyy-mm-dd, or null when empty. */
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (iso: string | null) => void;
  /** Earliest and latest allowed ISO dates. */
  min?: string;
  max?: string;
}

export interface ModalProps {
  title: string;
  /** sm 400 px, md 560 px (default), lg 720 px; a bottom sheet on phones (DESIGN_SYSTEM 5.8). */
  size?: 'sm' | 'md' | 'lg';
  isOpen: boolean;
  onClose: () => void;
  /** Footer buttons; the primary action last. */
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  /** false while saving: Escape and the scrim no longer close the dialog. */
  dismissible?: boolean;
  /** Full screen on phones (long forms). */
  fullOnPhone?: boolean;
  children?: ReactNode;
  className?: string;
}

export interface DrawerProps {
  title: string;
  /** right (default) or bottom; every drawer is a bottom sheet on phones (DESIGN_SYSTEM 5.9). */
  side?: 'right' | 'bottom';
  isOpen: boolean;
  onClose: () => void;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export interface ConfirmDialogProps {
  /** Names the record and what will happen, in plain words. */
  title: string;
  message?: ReactNode;
  tone?: 'default' | 'danger';
  /** Adds a required reason (reject, waitlist, blocklist, field unlock, deciding against the score). */
  reasonRequired?: boolean;
  reasonLabel?: string;
  /** A verb naming the action ("reject application"), never "OK". */
  confirmLabel: string;
  /** Effects listed before confirming, for example "the volunteer loses access to 12 applications". */
  consequence?: string[];
  isOpen: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  /** The action is running: confirm shows a spinner and the dialog cannot be dismissed. */
  pending?: boolean;
}

export interface MenuAction {
  id: string;
  label: string;
  icon?: IconComponent;
  /** A link to another page; the menu closes on navigation. */
  href?: string;
  /** An action instead of a link (log out). */
  onAction?: () => void;
}

export interface MenuButtonProps {
  /** Accessible name of the button and its menu ("profile menu"). */
  label: string;
  items: MenuAction[];
  /** What the button shows (the person's name); only the icon when left out. */
  children?: ReactNode;
  /** The icon of the button; a person by default in the app bar. */
  icon?: IconComponent;
  className?: string;
}

export interface TabItem {
  id: string;
  label: string;
  /** Count shown beside the label (English digits through the formatter). */
  count?: number;
  content: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  /** Controlled selection; keep it in the URL for shareable views (DESIGN_SYSTEM 5.13). */
  selectedId?: string;
  defaultSelectedId?: string;
  onChange?: (id: string) => void;
  /** line (default) or segmented for two or three short options. */
  variant?: 'line' | 'segmented';
  /** Accessible name of the tab list. */
  label: string;
  className?: string;
}

export interface TableColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /**
   * 1 always shown, 2 from 640 px, 3 desktop only, 4 desktop but hidden in the split view between
   * 1024 and 1439 px (DESIGN_SYSTEM 5.7, O-41).
   */
  priority?: 1 | 2 | 3 | 4;
  /** Numbers are right-aligned with tabular digits. */
  numeric?: boolean;
  sortable?: boolean;
  /** The column that names the row for screen readers (usually the name). */
  isRowHeader?: boolean;
}

export interface TableSort {
  column: string;
  direction: 'ascending' | 'descending';
}

export interface TablePagination {
  /** Rows shown so far and the capped total text such as "10000+" (cursor paging, API_STANDARDS). */
  shown: number;
  total: number | string;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  /** Phones use "load more" instead of previous and next. */
  onLoadMore?: () => void;
  /** Numbered pages: the current page, how many there are and how to open one. */
  page?: number;
  pageCount?: number;
  onPage?: (page: number) => void;
  /** The count line in the caller's words ("1–10 দেখানো হচ্ছে · মোট 23 জন"). */
  summary?: string;
}

export interface TableProps<T> {
  /** Accessible name of the table and the card list. */
  label: string;
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Name of a row for its checkbox and its card ("Select {name}"). */
  rowLabel: (row: T) => string;
  /** How a row renders as a card on phones (DESIGN_SYSTEM 5.7). */
  cardRenderer: (row: T) => ReactNode;
  selectionMode?: 'none' | 'single' | 'multiple';
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  sort?: TableSort;
  onSortChange?: (sort: TableSort) => void;
  /** Opens a row (split-view detail); Enter on the focused row also opens it. */
  onRowAction?: (key: string) => void;
  /** Ghost buttons or a menu at the row end; visible on hover or focus on desktop. */
  rowActions?: (row: T) => ReactNode;
  density?: 'comfortable' | 'compact';
  /** Hides priority 4 columns between 1024 and 1439 px. */
  inSplitView?: boolean;
  loading?: boolean;
  /** ErrorState element shown instead of rows. */
  error?: ReactNode;
  /** EmptyState element shown when there are no rows. */
  emptyState?: ReactNode;
  pagination?: TablePagination;
  /** TableToolbar element (search, chips, filters). */
  toolbar?: ReactNode;
  /**
   * default: the table in its own frame; panel: one white card holding the toolbar, the table and
   * the pager, with the row actions always shown.
   */
  layout?: 'default' | 'panel';
  className?: string;
}

export interface FilterChip {
  id: string;
  label: string;
  count?: number;
}

export interface TableToolbarProps {
  /** Called 300 ms after typing stops, with '' when fewer than 2 characters (DESIGN_SYSTEM 5.7). */
  onSearch?: (term: string) => void;
  searchPlaceholder?: string;
  chips?: FilterChip[];
  activeChip?: string;
  onChipChange?: (id: string) => void;
  /** Filter controls: inline from 640 px, in a bottom sheet behind a "filter" button on phones. */
  filters?: ReactNode;
  activeFilterCount?: number;
  onClearFilters?: () => void;
  /**
   * inline (default): the filters always show from 640 px; panel: they open in place under the
   * search with the filter button. Phones use a bottom sheet in both.
   */
  filterMode?: 'inline' | 'panel';
  /** The active filters as removable chips, with a "clear all" after them (panel mode). */
  activeFilters?: ActiveFilter[];
  className?: string;
}

export interface ActiveFilter {
  id: string;
  /** What is filtered, in words ("বিভাগ: ঢাকা"). */
  label: string;
  onRemove: () => void;
}

/** Everything a template supplies. */
export interface UiTemplate {
  TemplateProvider: ComponentType<TemplateProviderProps>;
  /** A plain anchor whose same-site clicks go through the app's router (cards, navigation). */
  Link: ComponentType<AnchorHTMLAttributes<HTMLAnchorElement> & RefAttributes<HTMLAnchorElement>>;
  Button: ComponentType<ButtonProps>;
  Select: ComponentType<SelectProps>;
  Combobox: ComponentType<ComboboxProps>;
  DateField: ComponentType<DateFieldProps>;
  Modal: ComponentType<ModalProps>;
  Drawer: ComponentType<DrawerProps>;
  ConfirmDialog: ComponentType<ConfirmDialogProps>;
  MenuButton: ComponentType<MenuButtonProps>;
  Tabs: ComponentType<TabsProps>;
  /** Generic over the row type, so it is a function type rather than a component type. */
  Table: <T>(props: TableProps<T>) => ReactElement;
  TableToolbar: ComponentType<TableToolbarProps>;
}
