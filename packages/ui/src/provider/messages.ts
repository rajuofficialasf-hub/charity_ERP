/**
 * The design system's own texts (screen-reader names, state words, pager words). packages/ui ships
 * no text: the app passes these messages in both languages through UiProvider (constitution §11,
 * I18N.md). T1.5 moves the values into the `ui` namespace of the message catalogue.
 *
 * Placeholders use `{name}` and receive already formatted values (numbers through the app's
 * formatter, so digits stay English, UX-05).
 */
export interface UiMessages {
  common: {
    close: string;
    cancel: string;
    loading: string;
    retry: string;
    dismiss: string;
    back: string;
    /** "{label}, {count} pending" style name for counts in nav items and tabs. */
    countName: string;
  };
  field: {
    /** Text mark after a required label, e.g. "(required)". */
    required: string;
    locked: string;
    requestCorrection: string;
    changed: string;
    /** "Previous value: {value}". */
    previousValue: string;
    /** Label of the text box opened by the "other" option (BD-14). */
    otherSpecify: string;
    selectPlaceholder: string;
    search: string;
    noResults: string;
    showOptions: string;
    openCalendar: string;
    previousMonth: string;
    nextMonth: string;
    /** Names of the parts of a date field, read by screen readers. */
    day: string;
    month: string;
    year: string;
    /** Shown in an empty part of a date field. */
    dayPlaceholder: string;
    monthPlaceholder: string;
    yearPlaceholder: string;
    /** Read by screen readers for an empty part of a date field. */
    emptyPart: string;
    errorSummaryTitle: string;
    /** Tag beside labels of fields visible to officials only (DESIGN_SYSTEM 5.4). */
    officialOnly: string;
    /** Label of the reason box of confirm dialogs. */
    reason: string;
    /** Names of the reveal button of PasswordField. */
    showPassword: string;
    hidePassword: string;
  };
  file: {
    takePhoto: string;
    chooseFile: string;
    chooseFromGallery: string;
    dropHere: string;
    /** "Remove {name}". */
    remove: string;
    retry: string;
    /** "{count} of {max} files". */
    count: string;
    /** "{name} is larger than {max}". */
    tooLarge: string;
    /** "{name}: this file type is not accepted". */
    wrongType: string;
    state: Record<
      | 'selected'
      | 'compressing'
      | 'queued'
      | 'uploading'
      | 'quarantined'
      | 'ready'
      | 'failed'
      | 'rejected',
      string
    >;
  };
  table: {
    search: string;
    filters: string;
    /** "{count} active". */
    filtersActive: string;
    clearFilters: string;
    applyFilters: string;
    loadMore: string;
    previous: string;
    next: string;
    /** "{shown} of {total}". */
    resultCount: string;
    selectAll: string;
    /** Row checkbox inside a table; the table names it after the row. */
    select: string;
    /** "Select {name}". */
    selectRow: string;
    rowActions: string;
    pagination: string;
    /** "Page {page}", the name of a numbered page button. */
    page: string;
    /** "Showing {from}–{to} of {total}". */
    range: string;
    /** "Remove {label}", the name of an active filter's remove button. */
    removeFilter: string;
    /** Removes every active filter at once. */
    clearAll: string;
  };
  bulk: {
    /** "{count} selected". */
    selectedCount: string;
    moreActions: string;
    showDetails: string;
    hideDetails: string;
  };
  nav: {
    breadcrumb: string;
    /** "Back to {parent}". */
    backTo: string;
    sectionSelect: string;
  };
  offline: {
    offline: string;
    backOnline: string;
    syncing: string;
    syncFailed: string;
    /** "{count} waiting to sync". */
    pending: string;
    openOutbox: string;
  };
  feedback: {
    /** "Request id: {id}". */
    requestId: string;
    /** "{value} of {max}". */
    valueOfMax: string;
    /** "{value} of {max} ({percent}%)". */
    progressText: string;
  };
  timeline: {
    done: string;
    current: string;
    upcoming: string;
    skipped: string;
    rejected: string;
  };
}

/** Replaces `{name}` placeholders with the given, already formatted values. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    // eslint-disable-next-line security/detect-object-injection -- read-only lookup of a placeholder name
    key in values ? String(values[key]) : match,
  );
}
