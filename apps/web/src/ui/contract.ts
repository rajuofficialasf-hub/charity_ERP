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
};

export type DataTableExtendedProps<Row> = DataTableProps<Row> & {
  /** Shown above the table; the table then sits in its own card. `label` still names the table. */
  title?: string;
  description?: string;
  /** Right of the title, for example an "Export" button. */
  actions?: ReactNode;
  /** Above the header row, usually a FilterBar. */
  toolbar?: ReactNode;
  pagination?: Pagination;
};

/** Filter fields in one responsive row above a list: a `group` named by `label` (default: labels.filters). */
export type FilterBarProps = { children: ReactNode; label?: string };

// ---------------------------------------------------------------------------------------------
// Overlays

/** A panel that slides in from the side, for details or a short task beside the page. */
export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  side?: "left" | "right";
};

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

// ---------------------------------------------------------------------------------------------

export type UiTemplateExtended = Omit<UiTemplate, "UiProvider" | "AppShell" | "Page" | "Icon" | "DataTable"> & {
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
};
