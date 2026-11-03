import type { UiLabels } from '@/ui/contract';

import { useContext, createContext } from 'react';

// ----------------------------------------------------------------------

/** The words the template shows on its own. A Bengali app passes its own through UiProvider. */
export const DEFAULT_LABELS: UiLabels = {
  mainNavigation: 'Main',
  accountLinks: 'Account',
  socialLinks: 'Follow us',
  openNavigation: 'Open navigation',
  closeNavigation: 'Close navigation',
  collapseNavigation: 'Collapse navigation',
  expandNavigation: 'Expand navigation',
  search: 'Search',
  searchPlaceholder: 'Search pages…',
  searchEmpty: 'No page matches',
  breadcrumb: 'Breadcrumb',
  back: 'Back',
  close: 'Close',
  dismiss: 'Dismiss',
  loading: 'Loading',
  rowsPerPage: 'Rows per page',
  rowsRange: '{from}–{to} of {total}',
  previous: 'Previous',
  next: 'Next',
  colorMode: 'Colour mode',
  lightMode: 'Switch to light mode',
  darkMode: 'Switch to dark mode',
  signOut: 'Sign out',
  filters: 'Filters',
  filtersActive: '{count} active',
  clearFilters: 'Clear filters',
  applyFilters: 'Apply filters',
  removeFilter: 'Remove {label}',
  clearAll: 'Clear all',
  selectAll: 'Select all',
  selectRow: 'Select {name}',
  selectedCount: '{count} selected',
  rowActions: 'Actions',
  loadMore: 'Load more',
  pages: 'Pages',
  page: 'Page {page}',
  otherSpecify: 'If other, please specify',
  selectPlaceholder: 'Select',
  noResults: 'No results',
  showOptions: 'Show options',
  clear: 'Clear',
  locked: 'Locked',
  requestCorrection: 'Request correction',
  changed: 'Changed',
  previousValue: 'Previous value: {value}',
  officialOnly: 'Officials only',
  showPassword: 'Show password',
  hidePassword: 'Hide password',
  errorSummaryTitle: 'Please correct the following:',
  cancel: 'Cancel',
  reason: 'Reason',
};

export const LabelsContext = createContext<UiLabels>(DEFAULT_LABELS);

export const useLabels = () => useContext(LabelsContext);

/** Fills `{name}` placeholders, for example in rowsRange. */
export function fill(text: string, values: Record<string, string | number>) {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
