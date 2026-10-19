/** A dash for an empty value in a list, read out as words. */
export function EmptyValue({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true" className="admin-dash">
        —
      </span>
      <span className="ui-sr-only">{label}</span>
    </>
  );
}
