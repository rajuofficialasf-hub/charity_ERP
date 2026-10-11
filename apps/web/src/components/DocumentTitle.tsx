/** The browser tab title of a screen; React 19 hoists `<title>` into `<head>`. */
export function DocumentTitle({ title }: { title: string }) {
  return <title>{title}</title>;
}
