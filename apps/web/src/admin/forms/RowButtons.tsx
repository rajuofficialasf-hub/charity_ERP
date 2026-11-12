import { IconButton } from '@/ui';

export interface RowButton {
  /** The accessible name and the tip, naming the row it acts on. */
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

/**
 * The icon buttons of a row in the builder (the options, the condition rows, the calculation
 * terms, a table's rows and columns): edit, move up, move down and remove, each shown only when
 * given. A button shows its icon alone; its label is its accessible name and its tip.
 */
export function RowButtons({
  edit,
  up,
  down,
  remove,
}: {
  edit?: RowButton;
  up?: RowButton;
  down?: RowButton;
  remove?: RowButton;
}) {
  const buttons = [
    { icon: 'edit' as const, action: edit },
    { icon: 'arrow-up' as const, action: up },
    { icon: 'arrow-down' as const, action: down },
    { icon: 'delete' as const, action: remove },
  ];
  return (
    <span className="fb-row-buttons">
      {buttons.map(({ icon, action }) =>
        action ? (
          <IconButton
            key={icon}
            size="small"
            label={action.label}
            icon={icon}
            disabled={action.disabled}
            onClick={action.onPress}
          />
        ) : null,
      )}
    </span>
  );
}
