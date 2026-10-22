import { Button, Stack } from '@css/ui';
import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';

export interface RowButton {
  /** The accessible name, naming the row it acts on. */
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

/**
 * The icon buttons of a row in the builder (the outline, the options, the condition rows and the
 * calculation terms): edit, move up, move down and remove, each shown only when given.
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
    { icon: Pencil, action: edit },
    { icon: ArrowUp, action: up },
    { icon: ArrowDown, action: down },
    { icon: Trash2, action: remove },
  ];
  return (
    <Stack direction="row" gap={1} wrap>
      {buttons.map(({ icon, action }) =>
        action ? (
          <Button
            key={action.label}
            size="sm"
            variant="ghost"
            icon={icon}
            iconOnly
            disabled={action.disabled}
            onPress={action.onPress}
          >
            {action.label}
          </Button>
        ) : null,
      )}
    </Stack>
  );
}
