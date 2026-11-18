import { Card, type ColorTone, type ExtendedIconName, IconTile, Stack, Text } from '@/ui';

export interface Fact {
  label: string;
  value: string;
  icon: ExtendedIconName;
  tone?: ColorTone;
}

/**
 * One key fact of the summary on a card of its own: a tinted tile with its icon beside the label
 * and the value, in body text so a period or a program's name reads on one or two lines (a stat
 * card's large figure is for numbers).
 */
export function FactTile({ label, value, icon, tone = 'primary' }: Fact) {
  return (
    <Card>
      <Stack direction="row" gap={2} align="center">
        <IconTile icon={icon} tone={tone} size="large" />
        <Stack gap={0.5}>
          <Text tone="muted" size="small">
            {label}
          </Text>
          <strong>{value}</strong>
        </Stack>
      </Stack>
    </Card>
  );
}
