import { Button, Stack } from '@/ui';

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
    { icon: 'edit' as const, action: edit },
    { icon: 'arrow-up' as const, action: up },
    { icon: 'arrow-down' as const, action: down },
    { icon: 'delete' as const, action: remove },
  ];
  return (
    <Stack direction="row" gap={1} wrap>
      {buttons.map(({ icon, action }) =>
        action ? (
          <Button
            key={action.label}
            size="small"
            variant="text"
            startIcon={icon}
            disabled={action.disabled}
            onClick={action.onPress}
          >
            {action.label}
          </Button>
        ) : null,
      )}
    </Stack>
  );
}
