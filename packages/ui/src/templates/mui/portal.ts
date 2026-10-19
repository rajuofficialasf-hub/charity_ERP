/**
 * The dialog a control sits in, where its list or calendar must render, else the page body: a
 * list rendered outside an open modal dialog is hidden from assistive technology and cannot take
 * the focus.
 */
export function insideDialog(element: HTMLElement | null): HTMLElement {
  return element?.closest<HTMLElement>('[role="dialog"], [role="alertdialog"]') ?? document.body;
}
