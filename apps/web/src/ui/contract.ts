// The UI component contract: the props of every piece of UI that pages, features and routes may
// use, and the theme tokens. Each UI template under ./templates/<name>/ implements all of it, and
// its implementation object must satisfy UiTemplate, so a missing or changed piece fails the type
// check.
//
// A page needs a piece the set lacks? Add it here first (name and props), then implement it in the
// current template with a test, then use it. Never import the template's own library in a page.
import type { ComponentType, ReactNode } from "react";
import type { FieldValues, SubmitHandler, UseFormReturn } from "react-hook-form";

// ---------------------------------------------------------------------------------------------
// Theme tokens: the only theme surface the app sees. Values live in ./tokens.ts; each template
// maps them onto its own theme.

/** One colour from lightest to darkest, plus the text colour that reads on `main`. */
export type ColorScale = {
  lighter: string;
  light: string;
  main: string;
  dark: string;
  darker: string;
  contrastText: string;
};

export type NeutralScale = Record<"50" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900", string>;

export type ThemeTokens = {
  colors: {
    primary: ColorScale;
    secondary: ColorScale;
    info: ColorScale;
    success: ColorScale;
    warning: ColorScale;
    error: ColorScale;
    neutral: NeutralScale;
  };
  /** Pixels per spacing step. Stack's `gap` and every template spacing use multiples of it. */
  spacing: number;
  /** Corner radius in pixels. */
  radius: { small: number; medium: number; large: number };
  typography: {
    /** Body text. The template loads the font file. */
    fontFamily: string;
    /** Headings. */
    headingFontFamily: string;
    /** Body font size in pixels. */
    fontSize: number;
  };
};

// ---------------------------------------------------------------------------------------------
// Shared value types

/** Icons by meaning. Each template maps a name to its own icon set. */
export type IconName =
  | "home"
  | "dashboard"
  | "user"
  | "users"
  | "settings"
  | "file"
  | "folder"
  | "upload"
  | "download"
  | "add"
  | "edit"
  | "delete"
  | "search"
  | "sign-out"
  | "close"
  | "info"
  | "success"
  | "warning"
  | "error";

/** Status colours for alerts and toasts. */
export type Tone = "info" | "success" | "warning" | "error";

/** Multiples of tokens.spacing. */
export type SpaceStep = 0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8;

// ---------------------------------------------------------------------------------------------
// Root, shell and page

/** Wraps the whole app: theme, CSS baseline, toasts, anything the template needs at the root. */
export type UiProviderProps = { children: ReactNode };

/** One link in the app navigation. `to` is an app path such as "/users". */
export type NavItem = { label: string; to: string; icon?: IconName; children?: NavItem[] };

/** A titled group of navigation links. */
export type NavGroup = { title?: string; items: NavItem[] };

/** The app frame around every in-app page: header, navigation, main area. */
export type AppShellProps = {
  children: ReactNode;
  navigation: NavGroup[];
  /** Right side of the header, for example the signed-in user's menu. */
  headerActions?: ReactNode;
};

/** One page's main content, with its heading and the document title. */
export type PageProps = {
  title: string;
  description?: string;
  /** Buttons next to the heading, for example "Add user". */
  actions?: ReactNode;
  children?: ReactNode;
};

/** The frame of the sign-in page. The form inside comes from the login pack. */
export type SignInLayoutProps = { title: string; description?: string; children: ReactNode };

/** A full-page error: not found, not allowed, a crashed route. `action` is usually a LinkButton home. */
export type ErrorScreenProps = { title: string; message: string; action?: ReactNode; kind?: "not-found" | "forbidden" | "error" };

// ---------------------------------------------------------------------------------------------
// Layout and text

/** Lays children out in a row or column with even gaps. */
export type StackProps = {
  children: ReactNode;
  direction?: "row" | "column";
  gap?: SpaceStep;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
  wrap?: boolean;
};

export type HeadingProps = { children: ReactNode; level?: 2 | 3 | 4 };

export type TextProps = { children: ReactNode; tone?: "default" | "muted" | "error"; size?: "body" | "small" };

/** Decorative unless `label` is given, which makes it an image with that name. */
export type IconProps = { name: IconName; label?: string; size?: number };

// ---------------------------------------------------------------------------------------------
// Actions

type ButtonLook = { variant?: "primary" | "secondary" | "text" | "danger"; startIcon?: IconName; fullWidth?: boolean };

export type ButtonProps = ButtonLook & {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  /** Shows progress and blocks clicks while an action runs. */
  loading?: boolean;
};

/** A link to a route inside the app, styled as a button. `to` is an app path such as "/". */
export type LinkButtonProps = ButtonLook & { to: string; children: ReactNode };

// ---------------------------------------------------------------------------------------------
// Fields and forms

type FieldBase = {
  label: string;
  name?: string;
  /** The error message under the field. Present means invalid. */
  error?: string;
  /** Help text under the field when there is no error. */
  hint?: string;
  required?: boolean;
  disabled?: boolean;
};

export type TextFieldProps = FieldBase & {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  type?: "text" | "email" | "password" | "search" | "tel" | "url" | "number";
  autoComplete?: string;
  placeholder?: string;
  /** Several lines of text. */
  rows?: number;
};

export type SelectOption = { value: string; label: string };

export type SelectFieldProps = FieldBase & {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  options: readonly SelectOption[];
};

/**
 * A react-hook-form form. Build `form` with useForm and zodResolver(<its zod schema in src/api/schemas.ts>), so
 * the browser shows the same messages the API would send. `error` is a form-level
 * message, for example from a failed mutation.
 */
export type FormProps<T extends FieldValues> = {
  form: UseFormReturn<T>;
  onSubmit: SubmitHandler<T>;
  children: ReactNode;
  error?: string;
  /** Accessible name of the form. */
  label: string;
};

/** A text field bound to the enclosing Form by `name`. Shows that field's schema error under it. */
export type FormTextFieldProps = Omit<TextFieldProps, "value" | "onChange" | "onBlur" | "error" | "name"> & { name: string };

/** A select field bound to the enclosing Form by `name`. */
export type FormSelectFieldProps = Omit<SelectFieldProps, "value" | "onChange" | "onBlur" | "error" | "name"> & { name: string };

/** The enclosing Form's submit button: disabled and busy while the submit runs. */
export type FormSubmitButtonProps = Omit<ButtonProps, "type" | "onClick" | "loading">;

// ---------------------------------------------------------------------------------------------
// Overlays and feedback

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Buttons at the bottom, for example Cancel and Save. */
  actions?: ReactNode;
  size?: "small" | "medium" | "large";
};

export type AlertProps = { tone: Tone; title?: string; children: ReactNode; action?: ReactNode };

export type ToastOptions = { tone?: Tone };

/** Shows short messages that disappear on their own. Use it in TanStack Query `onError`/`onSuccess`. */
export type ToastApi = {
  show: (message: string, options?: ToastOptions) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

export type LoadingStateProps = { label?: string };

export type EmptyStateProps = { title: string; description?: string; action?: ReactNode; icon?: IconName };

// ---------------------------------------------------------------------------------------------
// Data

export type DataTableColumn<Row> = {
  id: string;
  header: string;
  cell: (row: Row) => ReactNode;
  align?: "left" | "center" | "right";
};

export type DataTableProps<Row> = {
  /** Accessible name of the table. */
  label: string;
  rows: readonly Row[];
  columns: readonly DataTableColumn<Row>[];
  /** A stable id from the data. */
  getRowId: (row: Row) => string;
  /** True while the rows load, for example a query's isPending. */
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
};

// ---------------------------------------------------------------------------------------------
// The whole set. A template's index.ts builds an object that `satisfies UiTemplate`.

export type UiTemplate = {
  UiProvider: ComponentType<UiProviderProps>;
  AppShell: ComponentType<AppShellProps>;
  Page: ComponentType<PageProps>;
  SignInLayout: ComponentType<SignInLayoutProps>;
  ErrorScreen: ComponentType<ErrorScreenProps>;
  Stack: ComponentType<StackProps>;
  Heading: ComponentType<HeadingProps>;
  Text: ComponentType<TextProps>;
  Icon: ComponentType<IconProps>;
  Button: ComponentType<ButtonProps>;
  LinkButton: ComponentType<LinkButtonProps>;
  TextField: ComponentType<TextFieldProps>;
  SelectField: ComponentType<SelectFieldProps>;
  Form: <T extends FieldValues>(props: FormProps<T>) => ReactNode;
  FormTextField: ComponentType<FormTextFieldProps>;
  FormSelectField: ComponentType<FormSelectFieldProps>;
  FormSubmitButton: ComponentType<FormSubmitButtonProps>;
  Dialog: ComponentType<DialogProps>;
  Alert: ComponentType<AlertProps>;
  useToast: () => ToastApi;
  LoadingState: ComponentType<LoadingStateProps>;
  EmptyState: ComponentType<EmptyStateProps>;
  DataTable: <Row>(props: DataTableProps<Row>) => ReactNode;
};

// =============================================================================================
// The extended set (UiTemplateExtended): the core set plus the pieces org apps need for admin
// dashboards and public pages. Templates that implement it (asf, bare) satisfy
// UiTemplateExtended; a template on the core set only (minimal) still satisfies UiTemplate. A page
// that uses an extended piece fails the type check on a core-only template, which is the signal to
// switch templates or add the piece there.
//
// Every prop is plain data or ReactNode, like the core set: no template types, no `sx`.

/** Every core icon plus the icons admin and public pages use. */
export type ExtendedIconName =
  | IconName
  | "calendar"
  | "clock"
  | "check-in"
  | "check-out"
  | "briefcase"
  | "building"
  | "education"
  | "card"
  | "document"
  | "id-card"
  | "phone"
  | "mail"
  | "map-pin"
  | "family"
  | "child"
  | "money"
  | "chart"
  | "filter"
  | "bell"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "arrow-left"
  | "arrow-right"
  | "menu"
  | "sun"
  | "moon"
  | "eye"
  | "heart"
  | "hand-heart"
  | "play"
  | "more"
  | "external"
  | "refresh"
  | "star"
  | "gift"
  | "globe"
  | "leave"
  | "shield"
  | "check"
  | "hourglass"
  | "notebook"
  | "gallery";

/** Colour names a piece can take: the token scales plus a quiet neutral. */
export type ColorTone = "neutral" | "primary" | "secondary" | Tone;

export type ExtendedIconProps = Omit<IconProps, "name"> & { name: ExtendedIconName };

// ---------------------------------------------------------------------------------------------
// Root

/**
 * The words the template itself shows (buttons, landmarks, pagination). English by default; a
 * Bengali app passes its own. `{page}`, `{pages}`, `{from}`, `{to}` and `{total}` are filled in.
 */
export type UiLabels = {
  mainNavigation: string;
  accountLinks: string;
  socialLinks: string;
  openNavigation: string;
  closeNavigation: string;
  collapseNavigation: string;
  expandNavigation: string;
  search: string;
  searchPlaceholder: string;
  searchEmpty: string;
  breadcrumb: string;
  back: string;
  close: string;
  dismiss: string;
  loading: string;
  rowsPerPage: string;
  /** For example "1–10 of 42". */
  rowsRange: string;
  previous: string;
  next: string;
  colorMode: string;
  lightMode: string;
  darkMode: string;
  signOut: string;
  filters: string;
  /** For example "2 active", beside the filters button. */
  filtersActive: string;
  clearFilters: string;
  applyFilters: string;
  /** For example "Remove District: Dhaka". */
  removeFilter: string;
  clearAll: string;
  selectAll: string;
  /** For example "Select Amina Khatun". */
  selectRow: string;
  /** For example "3 selected". */
  selectedCount: string;
  /** The header of the row actions column. */
  rowActions: string;
  loadMore: string;
  /** The name of the page numbers' navigation. */
  pages: string;
  /** For example "Page 3". */
  page: string;
  /** The text box an "other" choice opens. */
  otherSpecify: string;
  /** An empty select's text. */
  selectPlaceholder: string;
  noResults: string;
  /** The button that opens a combobox's list. */
  showOptions: string;
  /** The button that empties a combobox. */
  clear: string;
  locked: string;
  requestCorrection: string;
  changed: string;
  /** For example "Previous value: 01711000000". */
  previousValue: string;
  officialOnly: string;
  showPassword: string;
  hidePassword: string;
  /** The heading of the error summary at the top of a form. */
  errorSummaryTitle: string;
  cancel: string;
  /** The reason box of a confirm dialog. */
  reason: string;
  takePhoto: string;
  chooseFile: string;
  chooseFromGallery: string;
  dropHere: string;
  /** For example "Remove photo.jpg". */
  removeFile: string;
  retryUpload: string;
  /** For example "2 of 5 files". */
  fileCount: string;
  /** For example "photo.jpg is larger than 5 MB". */
  fileTooLarge: string;
  /** For example "report.exe: this file type is not accepted". */
  fileWrongType: string;
  /** For example "photo.jpg: no more than 5 files can be added". */
  fileLimit: string;
  uploadSelected: string;
  uploadCompressing: string;
  uploadQueued: string;
  uploadUploading: string;
  uploadQuarantined: string;
  uploadReady: string;
  uploadFailed: string;
  uploadRejected: string;
  /** Read after a step that still needs something. */
  stepMissing: string;
  stepDone: string;
  stepCurrent: string;
  stepUpcoming: string;
  stepSkipped: string;
  stepRejected: string;
  /** For example "1,240 of 2,000 (62%)". */
  progressText: string;
  /** For example "Copy NID". */
  copy: string;
  copied: string;
  copyFailed: string;
  /** The name of a profile's action panel. */
  actions: string;
  offline: string;
  backOnline: string;
  syncing: string;
  syncFailed: string;
  /** For example "3 waiting to sync". */
  pendingSync: string;
  openOutbox: string;
  /** The name of the offline banner's landmark. */
  connectionStatus: string;
  moreActions: string;
  showDetails: string;
  hideDetails: string;
};

export type UiProviderExtendedProps = UiProviderProps & { labels?: Partial<UiLabels> };

// ---------------------------------------------------------------------------------------------
// Shell and page extras

/** One step in a breadcrumb trail. The last step is the current page and has no `to`. */
export type Crumb = { label: string; to?: string };

/** A parent with `children` opens and closes its group, so its own `to` is optional. */
export type ExtendedNavItem = Omit<NavItem, "icon" | "children" | "to"> & {
  to?: string;
  icon?: ExtendedIconName;
  children?: ExtendedNavItem[];
};

export type ExtendedNavGroup = { title?: string; items: ExtendedNavItem[] };

export type AppShellExtendedProps = Omit<AppShellProps, "navigation"> & {
  navigation: ExtendedNavGroup[];
  /** The product name in the navigation, with an optional tagline and logo (a URL under public/). */
  brand?: { name: string; tagline?: string; logoSrc?: string };
  /** A ⌘K / Ctrl+K search over the navigation links. On by default. */
  search?: boolean;
};

export type PageExtendedProps = PageProps & {
  breadcrumbs?: readonly Crumb[];
  /** A "Back" link above the heading, for sub-pages such as a form. */
  back?: { label: string; to: string };
};

// ---------------------------------------------------------------------------------------------
// Containers and display

/** A titled surface that groups related content. Never nest one inside another. */
export type CardProps = {
  title?: string;
  icon?: ExtendedIconName;
  /** Right of the title, for example a "View all" LinkButton. */
  action?: ReactNode;
  children: ReactNode;
  /** "none" lets a table or list run edge to edge. */
  padding?: "normal" | "none";
  /** The title's heading level: 2 by default, 3 for a card inside a titled Section. */
  headingLevel?: 2 | 3;
};

/** Columns per screen width. `base` is phones; wider sizes inherit the last one set. */
export type ResponsiveColumns = { base?: number; sm?: number; md?: number; lg?: number };

export type GridProps = { children: ReactNode; columns: ResponsiveColumns; gap?: SpaceStep };

export type DescriptionItem = { label: string; value: ReactNode };

/** Label and value pairs. "rows" puts the value at the right; "grid" puts it under its label. */
export type DescriptionListProps = {
  items: readonly DescriptionItem[];
  layout?: "rows" | "grid";
  /** Columns for the grid layout on wide screens. */
  columns?: 2 | 3 | 4;
  /** Shown for an empty value (null, undefined or ""). Defaults to an em dash. */
  emptyValue?: string;
};

/** A short status word, for example "Approved". */
export type ChipProps = { children: ReactNode; tone?: ColorTone; variant?: "soft" | "outline" | "solid"; size?: "small" | "medium" };

/** `decorative` hides it from screen readers when the name is already written next to it. */
export type AvatarProps = { name: string; src?: string; size?: "small" | "medium" | "large" | "xlarge"; decorative?: boolean };

/** One figure with its label, for example "Present days 18". */
export type StatCardProps = {
  label: string;
  value: ReactNode;
  icon?: ExtendedIconName;
  tone?: ColorTone;
  /** "tinted" fills the card with the tone's light shade and outlines it. */
  variant?: "plain" | "tinted";
};

/** A figure with a ring that shows how much of a whole it is. `percent` is 0–100, clamped and rounded. */
export type ProgressStatProps = { label: string; value: ReactNode; percent: number; tone?: ColorTone };

/** The coloured welcome band at the top of a dashboard: who, and today's key figures. */
export type SummaryBannerProps = {
  title: string;
  subtitle?: string;
  avatar?: { name: string; src?: string };
  items: readonly { label: string; value: ReactNode; icon?: ExtendedIconName; tone?: ColorTone }[];
};

export type TabItem = { value: string; label: string; icon?: ExtendedIconName; content: ReactNode };

/**
 * Tabs with their panels. Pass `value` and `onChange` to control them, for example from the URL.
 * A `value` that matches no item selects the first tab.
 */
export type TabsProps = {
  /** Accessible name of the tab list. */
  label: string;
  items: readonly TabItem[];
  value?: string;
  onChange?: (value: string) => void;
  /** "underline" for sections of one record; "segmented" for views of one list. */
  variant?: "underline" | "segmented";
};

// ---------------------------------------------------------------------------------------------
// Dates and times. Values are ISO strings: "2026-10-25", "09:30", "2026-10"; "" when empty.

type PickerBase = FieldBase & { value: string; onChange: (value: string) => void; onBlur?: () => void };

export type DateFieldProps = PickerBase & { min?: string; max?: string };
export type TimeFieldProps = PickerBase;
export type MonthFieldProps = PickerBase & { min?: string; max?: string };

export type FormDateFieldProps = Omit<DateFieldProps, "value" | "onChange" | "onBlur" | "error" | "name"> & { name: string };
export type FormTimeFieldProps = Omit<TimeFieldProps, "value" | "onChange" | "onBlur" | "error" | "name"> & { name: string };

// ---------------------------------------------------------------------------------------------
// Data

/** Page numbers start at 1. */
export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
  /** Numbered page buttons beside the range, for lists people page through; it has no page-size choice. */
  showPageNumbers?: boolean;
};

/** Previous and next for a list read by cursor, where the total may only be known as "10000+". */
export type CursorPagination = {
  /** The count line in the caller's words, for example "1–10 of 10000+". */
  summary?: string;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  /** Phones show "load more" instead of previous and next when this is given. */
  onLoadMore?: () => void;
};

export type DataTableSort = { columnId: string; direction: "asc" | "desc" };

export type DataTableExtendedColumn<Row> = DataTableColumn<Row> & {
  /** 1 always shown, 2 from the sm breakpoint, 3 from lg. */
  priority?: 1 | 2 | 3;
  /** Right-aligned with tabular digits. */
  numeric?: boolean;
  sortable?: boolean;
  /** The column that names the row for screen readers, usually the name. */
  isRowHeader?: boolean;
};

export type DataTableExtendedProps<Row> = Omit<DataTableProps<Row>, "columns"> & {
  columns: readonly DataTableExtendedColumn<Row>[];
  /** Shown above the table; the table then sits in its own card. `label` still names the table. */
  title?: string;
  description?: string;
  /** Right of the title, for example an "Export" button. */
  actions?: ReactNode;
  /** Above the header row, usually a FilterBar. */
  toolbar?: ReactNode;
  pagination?: Pagination;
  cursorPagination?: CursorPagination;
  /** A row's name for its checkbox and its card's open button. */
  rowLabel?: (row: Row) => string;
  /** Below the md breakpoint the rows show as these cards instead of the table. */
  cardRenderer?: (row: Row) => ReactNode;
  selectionMode?: "none" | "single" | "multiple";
  /**
   * The selected rows' ids when the caller keeps them; otherwise the table keeps its own. Rows chosen
   * on other pages stay chosen and are counted; "select all" adds or removes the rows shown.
   */
  selectedIds?: ReadonlySet<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  /** Beside the count of selected rows while any is selected, for example "Approve". */
  bulkActions?: ReactNode;
  sort?: DataTableSort;
  onSortChange?: (sort: DataTableSort) => void;
  /** Opens a row: a click on it, or Enter while it has focus. */
  onRowOpen?: (row: Row) => void;
  /** Buttons or a menu at the row's end, under the header labels.rowActions. */
  rowActions?: (row: Row) => ReactNode;
  dense?: boolean;
  /** Shown instead of the rows, for example an error with a retry. */
  error?: ReactNode;
  /** In the empty state, for example "Add the first project". */
  emptyAction?: ReactNode;
};

export type FilterChip = { id: string; label: string; count?: number };

export type ActiveFilter = {
  id: string;
  /** What is filtered, in words, for example "District: Dhaka". */
  label: string;
  onRemove: () => void;
};

/**
 * Filter fields in one responsive row above a list: a `group` named by `label` (default:
 * labels.filters). On phones the fields sit behind a filters button, in a panel.
 */
export type FilterBarProps = {
  children?: ReactNode;
  label?: string;
  /** A search box first in the bar, called 300 ms after typing stops, with '' under 2 characters. */
  onSearch?: (term: string) => void;
  /** The search the list starts with, for example from the address. */
  initialSearch?: string;
  searchPlaceholder?: string;
  /** One-tap status choices under the bar; the one with `activeChip`'s id is pressed. */
  chips?: readonly FilterChip[];
  activeChip?: string;
  onChipChange?: (id: string) => void;
  /** The filters in force as removable chips, with "clear all" after them. */
  activeFilters?: readonly ActiveFilter[];
  onClearFilters?: () => void;
  /** The fields stay behind the filters button on wide screens too, opening in place. */
  collapsible?: boolean;
};

// ---------------------------------------------------------------------------------------------
// Overlays

/** A panel that slides in from the side, for details or a short task beside the page. */
export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  /** On a phone every drawer is a bottom sheet. */
  side?: "left" | "right" | "bottom";
};

// ---------------------------------------------------------------------------------------------
// Choices

/** A choice of a select, combobox, radio or checkbox group. */
export type ChoiceOption = SelectOption & { disabled?: boolean };

/**
 * The choice that means "other" opens a text box inside the same field, labelled
 * labels.otherSpecify unless `label` is given.
 */
export type OtherChoice = { value: string; text: string; onTextChange: (text: string) => void; label?: string };

/** One checkbox: a visible `label`, or `ariaLabel` when the label is elsewhere (a table row). */
export type CheckboxProps = {
  label?: string;
  ariaLabel?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  indeterminate?: boolean;
  disabled?: boolean;
  hint?: string;
  name?: string;
};

export type CheckboxGroupProps = FieldBase & {
  options: readonly ChoiceOption[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  /** Two columns from the sm breakpoint. */
  columns?: 1 | 2;
  other?: OtherChoice;
};

export type RadioGroupProps = FieldBase & {
  options: readonly ChoiceOption[];
  value: string | null;
  onChange: (value: string) => void;
  orientation?: "vertical" | "horizontal";
  other?: OtherChoice;
};

/** An on/off setting that applies at once, unlike a checkbox in a form that is saved later. */
export type SwitchProps = {
  label?: string;
  ariaLabel?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
};

/** A select with the app's extras; `searchable` turns it into a combobox, on by default above 10 options. */
export type SelectFieldExtendedProps = Omit<SelectFieldProps, "options"> & {
  options: readonly ChoiceOption[];
  placeholder?: string;
  searchable?: boolean;
  other?: OtherChoice;
};

/** Type to narrow a long list; `freeText` keeps text that is not one of the options. */
export type ComboboxProps = FieldBase & {
  options: readonly ChoiceOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  onBlur?: () => void;
  placeholder?: string;
  /** Called with the typed text, for a server search or free text. */
  onInputChange?: (text: string) => void;
  /** The chosen value's label while it is not among the options, such as a saved record before a search. */
  valueLabel?: string;
  /** The options come from a server search on the typed text and are not filtered again here. */
  serverSearch?: boolean;
  /** True while the server search runs. */
  loading?: boolean;
  /** Text that is not one of the options is kept; `onChange` then receives the text itself. */
  freeText?: boolean;
};

// ---------------------------------------------------------------------------------------------
// Text fields and form parts

/** The states a field of an ERP record can be in, beside its value. */
export type FieldStates = {
  /** Names the control, so an error summary can link to it. */
  id?: string;
  /** Read-only with a lock: the value stays readable and copyable, and changes only by a correction. */
  locked?: boolean;
  /** Shows the "request correction" link of a locked field. */
  onRequestCorrection?: () => void;
  readOnly?: boolean;
  /** Marks a changed field with the value it had before. */
  previousValue?: string;
  /** Marks a field only officials see. */
  officialOnly?: boolean;
};

/**
 * A text field with the app's kinds: `nid` (an identity number on the numeric keypad), `integer`,
 * `decimal` and `money` (Bengali digits typed become English digits, other characters are dropped,
 * money has the taka sign), `tel` (a mobile number, English digits, no autofill unless asked) and
 * `password` (with a show and hide button).
 */
export type TextFieldExtendedProps = Omit<TextFieldProps, "type"> &
  FieldStates & {
    type?: TextFieldProps["type"] | "nid" | "integer" | "decimal" | "money";
    maxLength?: number;
    inputMode?: "text" | "numeric" | "decimal" | "email" | "tel";
    /** The language of the value when it is in the other language. */
    lang?: string;
    /** A small action or state inside the field at its end, for example "Verify" or a verified mark. */
    endAction?: ReactNode;
  };

export type ErrorSummaryItem = { fieldId: string; message: string };

/** The errors of a submitted form, each a link to its field; it takes focus when they appear. */
export type ErrorSummaryProps = {
  errors: readonly ErrorSummaryItem[];
  title?: string;
  /**
   * It takes focus when errors appear, and again when this changes, for example the form's submit
   * count; never while the person corrects a field.
   */
  focusKey?: string | number;
};

/** A part of a long form: a fieldset named by its title. */
export type FormSectionProps = { title: string; description?: string; children: ReactNode };

// ---------------------------------------------------------------------------------------------
// Overlays of the app

export type DialogExtendedProps = DialogProps & {
  /** False while saving: Escape, a click outside and the close button no longer close it. */
  dismissible?: boolean;
  /** Fills the screen on a phone, for a long form. */
  fullScreenOnPhone?: boolean;
};

/**
 * Asks before an action that matters. The title names the record and what happens; the confirm
 * button is a verb ("Reject application"), never "OK".
 */
export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message?: ReactNode;
  tone?: "default" | "danger";
  confirmLabel: string;
  /** What will follow, listed before confirming. */
  consequences?: readonly string[];
  /** A reason must be written before confirming (reject, waitlist, blocklist, unlock). */
  reasonRequired?: boolean;
  reasonLabel?: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  /** The action runs: the confirm button is busy and the dialog stays open. */
  pending?: boolean;
};

/** A choice of a menu: a link to an app path, or an action. */
export type MenuItemSpec = {
  id: string;
  label: string;
  icon?: ExtendedIconName;
  to?: string;
  onSelect?: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
};

/** A button that opens a list of choices, for a row's actions or a profile's. */
export type MenuProps = {
  /** The accessible name of the button and its list. */
  label: string;
  items: readonly MenuItemSpec[];
  /** What the button shows; three dots when left out. */
  children?: ReactNode;
};

// ---------------------------------------------------------------------------------------------
// Files

/** Where a file is on its way: picked, made smaller, waiting offline, sent, checked, ready, or not. */
export type UploadState = "selected" | "compressing" | "queued" | "uploading" | "quarantined" | "ready" | "failed" | "rejected";

export type UploadItem = {
  id: string;
  name: string;
  state: UploadState;
  /** A local preview of an image (an object URL). */
  previewUrl?: string;
  /** 0 to 100 while uploading. */
  progress?: number;
  /** Why it failed or was not accepted, in the person's language. */
  reason?: string;
  /** A photo's capture time and place, as the caller words it. */
  meta?: string;
  /** Files can be removed only before the form is sent. */
  removable?: boolean;
};

/** Photos and files with previews and each file's state; the caller uploads and reports back. */
export type FileUploadProps = Omit<FieldBase, "name"> & {
  /** The camera, the gallery, either, or any file, from the project's photo-source setting. */
  source?: "camera" | "gallery" | "camera_or_gallery" | "file";
  /** Accepted types, for example ["image/jpeg", "image/png"], ["image/*"] or [".pdf"]. */
  accept?: readonly string[];
  /** The largest accepted size in bytes, and its text such as "5 MB". */
  maxSize?: number;
  maxSizeText?: string;
  multiple?: boolean;
  maxFiles?: number;
  value: readonly UploadItem[];
  /** The files that passed the type and size checks. */
  onAdd: (files: File[]) => void;
  /** A file that failed a check, with the reason in words. */
  onReject?: (file: File, reason: string) => void;
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
};

// ---------------------------------------------------------------------------------------------
// Progress and steps

/** A step's own mark, for a wizard that knows what each step still needs. */
export type StepMark = "complete" | "missing" | undefined;

/** The steps of a task in order, the current one marked; given `onSelect`, each step opens itself. */
export type StepperProps = {
  /** The accessible name of the list, for example "Registration steps". */
  label: string;
  steps: readonly string[];
  /** The current step's index, from 0. */
  current: number;
  /** Without marks the steps before the current one count as done. */
  marks?: readonly StepMark[];
  onSelect?: (index: number) => void;
};

export type TimelineStatus = "done" | "current" | "upcoming" | "skipped" | "rejected";

export type TimelineStep = {
  id: string;
  title: string;
  /** Who acted; shown only with `showActor`, which a page sets for officials. */
  actor?: string;
  /** The time as the page words it, in English digits. */
  time?: string;
  comment?: ReactNode;
  status: TimelineStatus;
};

/** What happened to a record, in order: a vertical history, or a short strip of stages. */
export type TimelineProps = {
  label: string;
  steps: readonly TimelineStep[];
  orientation?: "vertical" | "horizontal";
  showActor?: boolean;
};

/** One part of a stacked bar, for example "spent". */
export type ProgressSegment = { label: string; value: number };

/** How far a figure is towards its target; the numbers are always written beside the bar. */
export type ProgressBarProps = {
  /** The visible label and the accessible name. */
  label: string;
  value: number;
  max: number;
  showValue?: boolean;
  /** primary by default; warning or error for a budget overrun or a quota exceeded. */
  tone?: "primary" | "success" | "warning" | "error";
  size?: "small" | "medium";
  /** Up to four stacked parts with a written legend. */
  segments?: readonly ProgressSegment[];
};

/** Grey shapes in the layout of what is loading: a line of text, a list row, a card or a figure. */
export type SkeletonProps = { shape?: "text" | "row" | "card" | "stat"; count?: number };

// ---------------------------------------------------------------------------------------------
// People and profiles

/** A soft square with an icon, a person's initial or a photo; decorative beside its words. */
export type IconTileProps = {
  icon?: ExtendedIconName;
  /** Its first letter shows when there is no icon or photo. */
  name?: string;
  /** Never a sensitive photo such as an NID photo. */
  src?: string;
  tone?: ColorTone;
  size?: "small" | "medium" | "large";
};

/** The first cell of a list of people or records: a tile, the name (a link when `to` is given) and a second line. */
export type PersonCellProps = {
  name: string;
  /** The app path of the person's or the record's page. */
  to?: string;
  /** A quiet second line: an id, a type, a family size. */
  secondary?: string;
  photo?: string;
  /** The language of the name when it is in the other language. */
  lang?: string;
};

/** Copies a value and says so to screen readers, each time it is pressed. */
export type CopyButtonProps = { value: string; label: string };

/** A key fact of a profile under the name, for example the NID with a copy button. */
export type ProfileFact = {
  id: string;
  /** Written before the value with `showLabel`, otherwise only read out. */
  label: string;
  value: string;
  icon?: ExtendedIconName;
  showLabel?: boolean;
  copy?: boolean;
};

/** The dark banner at the top of a person's profile: photo or initial, name, states, key facts and actions. */
export type ProfileBannerProps = {
  name: string;
  /** 2 when the page has its own title above the banner. */
  headingLevel?: 1 | 2;
  photo?: string;
  /** The state chips beside the name. */
  status?: ReactNode;
  facts?: readonly ProfileFact[];
  /** Right of the banner on a wide screen, under the person on a phone. */
  actions?: ReactNode;
  /** The name of the action panel; labels.actions when left out. */
  actionsLabel?: string;
};

/** A section of a profile whose title opens and closes it; `action`, such as an edit button, sits beside the title. */
export type ProfileSectionProps = {
  title: string;
  icon?: ExtendedIconName;
  action?: ReactNode;
  defaultOpen?: boolean;
  headingLevel?: 2 | 3;
  children: ReactNode;
};

export type ContactItem = {
  id: string;
  icon: ExtendedIconName;
  /** What it is, for example "Mobile", read out before the value. */
  label: string;
  value: string;
  /** tel:, mailto: or a web address that the action link opens. */
  href?: string;
  /** The words of the action link, for example "Call". */
  actionLabel?: string;
  /** The link leads to another site (WhatsApp, Facebook) and opens in a new tab. */
  external?: boolean;
  copy?: boolean;
};

export type ContactListProps = { items: readonly ContactItem[] };

// ---------------------------------------------------------------------------------------------
// States, counts and lists of the app

/** Every state a record shows, each with its own colour and icon; the words come from the page. */
export type StatusKey =
  | "draft"
  | "needs_verification"
  | "submitted"
  | "under_review"
  | "reviewed"
  | "waitlisted"
  | "approved"
  | "rejected"
  | "implementation"
  | "completed"
  | "closed"
  | "deleted"
  | "sync_pending"
  | "sync_syncing"
  | "sync_synced"
  | "sync_failed"
  | "photo_verified"
  | "photo_flagged"
  | "photo_pending"
  | "blocklisted";

/** A state as a soft chip with its icon and its words, never colour alone. */
export type StatusChipProps = { status: StatusKey; label: string; size?: "small" | "medium"; lang?: string };

export type StatFilterItem = {
  id: string;
  label: string;
  value: number;
  icon: ExtendedIconName;
  tone?: ColorTone;
  /** False for a count that is shown but does not filter the list. */
  selectable?: boolean;
};

/** Counts above a list that filter it when chosen; past `visible`, the rest sit behind a last card. */
export type StatFilterBarProps = {
  label: string;
  items: readonly StatFilterItem[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  visible?: number;
  /** The last card's label, for example "More states". */
  moreLabel: string;
  /** The last card's figure for the hidden counts, for example "4 more". */
  moreValue: (hidden: number) => string;
  loading?: boolean;
};

export type OfflineState = "offline" | "back_online" | "syncing" | "sync_failed";

/** The connection and sync state under the app bar; "back online" hides itself after 4 seconds. */
export type OfflineBannerProps = {
  state: OfflineState;
  /** Records waiting in the outbox; shown, not announced on each change. */
  pendingCount?: number;
  onOpenOutbox?: () => void;
  onHidden?: () => void;
  /** Words in place of the state's own. */
  text?: string;
  /** The landmark's name in place of labels.connectionStatus. */
  label?: string;
};

/** A part of a page that opens and closes by its title; open from outside with `open` and `onToggle`. */
export type DisclosureProps = {
  title: string;
  /** A short note beside the title: a count, "optional". */
  hint?: string;
  icon?: ExtendedIconName;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  headingLevel?: 2 | 3 | 4;
  children: ReactNode;
};

export type ChoiceTile = { id: string; title: string; description?: string; icon?: ExtendedIconName; disabled?: boolean };

export type ChoiceTileGroup = { title: string; tiles: readonly ChoiceTile[] };

/** One choice among a few larger tiles, each with a line on what it means; flat or under group titles. */
export type ChoiceTilesProps = FieldBase & {
  tiles: readonly ChoiceTile[] | readonly ChoiceTileGroup[];
  value: string | null;
  onChange: (id: string) => void;
  columns?: 1 | 2;
};

export type BulkState = { status: StatusKey; label: string };

/** One row of a day's work on a phone: choose it, act on it at once, or open its details. */
export type BulkRowProps = {
  title: string;
  /** The application number and village, as the page words them. */
  meta?: string;
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
  state?: BulkState;
  photoState?: BulkState;
  syncState?: BulkState;
  quickAction?: { label: string; icon?: ExtendedIconName; onClick: () => void; disabled?: boolean };
  /** The other outcomes (absent, later, not distributed, damaged, partial), behind labels.moreActions. */
  menuActions?: readonly { id: string; label: string; onSelect: () => void }[];
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** The row's details: quantities and a note. */
  children?: ReactNode;
};

/** The list of bulk rows with "select all remaining" and the count chosen. */
export type BulkListProps = {
  label: string;
  selectAllLabel?: string;
  allSelected?: boolean;
  someSelected?: boolean;
  onSelectAll?: (selected: boolean) => void;
  selectedCount?: number;
  children: ReactNode;
};

/** An item that needs the person: why, how long it has waited, and a link or one action. */
export type AttentionCardProps = {
  tone?: Tone;
  icon: ExtendedIconName;
  title: string;
  reason?: string;
  /** For example "waiting 6 days". */
  meta?: string;
  /** The whole card is a link to this app path. */
  to?: string;
  action?: ReactNode;
};

/** A button that shows only its icon; `label` is its name and its tooltip. */
export type IconButtonProps = {
  label: string;
  icon: ExtendedIconName;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
  size?: "small" | "medium";
};

/** `text` is the quiet button of row actions and links in a sentence; `small` for dense rows. */
export type ButtonExtendedProps = ButtonProps & { size?: "small" | "medium" };

/** The signed-in user's button in the header and the panel it opens. */
export type AccountMenuProps = {
  user: { name: string; email?: string; avatarSrc?: string };
  links?: readonly { label: string; to: string; icon?: ExtendedIconName }[];
  /** Without it there is no sign-out button. */
  onSignOut?: () => void;
  signOutLabel?: string;
};

// ---------------------------------------------------------------------------------------------
// Public pages

export type LanguageSwitchProps = {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
};

export type FooterColumn = { title: string; links: readonly { label: string; to: string }[] };

/** The frame of a public site: a floating top bar with navigation and actions, and the footer. */
export type PublicShellProps = {
  children: ReactNode;
  brand: { name: string; logoSrc?: string };
  navigation: readonly { label: string; to: string }[];
  /** Right of the navigation, for example a LanguageSwitch and a "Donate" LinkButton. */
  actions?: ReactNode;
  footer?: {
    about?: ReactNode;
    columns?: readonly FooterColumn[];
    /** Links out of the site (http URLs). */
    social?: readonly { label: string; href: string }[];
    copyright: string;
  };
};

/** The opening band of a public page. "large" for a home page; "compact" for an inner page title. */
export type HeroProps = {
  title: string;
  description?: ReactNode;
  image?: { src: string; alt: string };
  actions?: ReactNode;
  size?: "large" | "compact";
  /** Content that overlaps the hero's lower edge, for example a quick donation form. */
  overlap?: ReactNode;
};

/** One band of a public page with a centred heading. */
export type SectionProps = {
  title?: string;
  description?: string;
  children: ReactNode;
  tone?: "default" | "muted" | "brand";
  /** Below the content, for example a "See all" LinkButton. */
  action?: ReactNode;
};

/** An image card for an activity, fund or article. `to` makes the whole card a link. */
export type MediaCardProps = {
  image: { src: string; alt: string };
  title: string;
  description?: string;
  /** A small label above the title, for example the activity's category. */
  category?: string;
  /** Under the text, for example the date. */
  meta?: string;
  action?: ReactNode;
  to?: string;
  orientation?: "vertical" | "horizontal";
  /** The title's heading level: 3 by default (cards sit under a Section's h2). */
  headingLevel?: 2 | 3 | 4;
};

/** A row of items that scrolls sideways, with previous and next buttons. */
export type CarouselProps = { label: string; children: ReactNode; itemsPerView?: ResponsiveColumns };

/** Short points side by side, each with an icon, title and text. */
export type FeatureListProps = { items: readonly { icon: ExtendedIconName; title: string; description: string }[] };

/** A large coloured link with an icon, for a few top-level choices. */
export type LinkTileProps = { to: string; label: string; icon: ExtendedIconName; tone?: ColorTone };

/** A coloured band that asks for one action, for example a newsletter sign-up. */
export type CalloutBandProps = { title: string; description?: string; children?: ReactNode };

/** The light and dark switch; until the person picks, the device's mode applies. */
export type ColorModeButtonProps = Record<string, never>;

// ---------------------------------------------------------------------------------------------

export type UiTemplateExtended = Omit<UiTemplate, "UiProvider" | "AppShell" | "Page" | "Icon" | "DataTable" | "SelectField" | "TextField" | "Dialog" | "Button"> & {
  Button: ComponentType<ButtonExtendedProps>;
  Dialog: ComponentType<DialogExtendedProps>;
  TextField: ComponentType<TextFieldExtendedProps>;
  SelectField: ComponentType<SelectFieldExtendedProps>;
  UiProvider: ComponentType<UiProviderExtendedProps>;
  AppShell: ComponentType<AppShellExtendedProps>;
  Page: ComponentType<PageExtendedProps>;
  Icon: ComponentType<ExtendedIconProps>;
  DataTable: <Row>(props: DataTableExtendedProps<Row>) => ReactNode;
  Card: ComponentType<CardProps>;
  Grid: ComponentType<GridProps>;
  DescriptionList: ComponentType<DescriptionListProps>;
  Chip: ComponentType<ChipProps>;
  Avatar: ComponentType<AvatarProps>;
  StatCard: ComponentType<StatCardProps>;
  ProgressStat: ComponentType<ProgressStatProps>;
  SummaryBanner: ComponentType<SummaryBannerProps>;
  Tabs: ComponentType<TabsProps>;
  DateField: ComponentType<DateFieldProps>;
  TimeField: ComponentType<TimeFieldProps>;
  MonthField: ComponentType<MonthFieldProps>;
  FormDateField: ComponentType<FormDateFieldProps>;
  FormTimeField: ComponentType<FormTimeFieldProps>;
  FilterBar: ComponentType<FilterBarProps>;
  Drawer: ComponentType<DrawerProps>;
  Checkbox: ComponentType<CheckboxProps>;
  CheckboxGroup: ComponentType<CheckboxGroupProps>;
  RadioGroup: ComponentType<RadioGroupProps>;
  Switch: ComponentType<SwitchProps>;
  Combobox: ComponentType<ComboboxProps>;
  ErrorSummary: ComponentType<ErrorSummaryProps>;
  FormSection: ComponentType<FormSectionProps>;
  ConfirmDialog: ComponentType<ConfirmDialogProps>;
  Menu: ComponentType<MenuProps>;
  FileUpload: ComponentType<FileUploadProps>;
  Stepper: ComponentType<StepperProps>;
  Timeline: ComponentType<TimelineProps>;
  ProgressBar: ComponentType<ProgressBarProps>;
  Skeleton: ComponentType<SkeletonProps>;
  IconTile: ComponentType<IconTileProps>;
  PersonCell: ComponentType<PersonCellProps>;
  CopyButton: ComponentType<CopyButtonProps>;
  ProfileBanner: ComponentType<ProfileBannerProps>;
  ProfileSection: ComponentType<ProfileSectionProps>;
  ContactList: ComponentType<ContactListProps>;
  StatusChip: ComponentType<StatusChipProps>;
  StatFilterBar: ComponentType<StatFilterBarProps>;
  OfflineBanner: ComponentType<OfflineBannerProps>;
  Disclosure: ComponentType<DisclosureProps>;
  ChoiceTiles: ComponentType<ChoiceTilesProps>;
  BulkList: ComponentType<BulkListProps>;
  BulkRow: ComponentType<BulkRowProps>;
  AttentionCard: ComponentType<AttentionCardProps>;
  IconButton: ComponentType<IconButtonProps>;
  AccountMenu: ComponentType<AccountMenuProps>;
  LanguageSwitch: ComponentType<LanguageSwitchProps>;
  PublicShell: ComponentType<PublicShellProps>;
  Hero: ComponentType<HeroProps>;
  Section: ComponentType<SectionProps>;
  MediaCard: ComponentType<MediaCardProps>;
  Carousel: ComponentType<CarouselProps>;
  FeatureList: ComponentType<FeatureListProps>;
  LinkTile: ComponentType<LinkTileProps>;
  CalloutBand: ComponentType<CalloutBandProps>;
  ColorModeButton: ComponentType<ColorModeButtonProps>;
};
