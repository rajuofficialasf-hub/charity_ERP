/**
 * Saves a file the API sent: the browser keeps it under `name`. No address that works on its own
 * ever leaves the page; the object made for the save is let go once the click is handled.
 */
export function saveFile(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
