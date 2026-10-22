import { useId, useState } from 'react';
import { Icon, type IconComponent } from '../Icon/Icon.js';
import {
  type FieldBaseProps,
  fieldClass,
  NativeFieldLabel,
  useFieldIds,
} from '../Field/FieldParts.js';

export interface ChoiceTile {
  id: string;
  /** The choice in a few words. */
  title: string;
  /** What it means or an example, one short line. */
  description?: string;
  icon?: IconComponent;
  disabled?: boolean;
}

export interface ChoiceTileGroup {
  /** A heading over a run of tiles. */
  title: string;
  tiles: ChoiceTile[];
}

export interface ChoiceTilesProps extends FieldBaseProps {
  /** Flat tiles, or tiles under group headings. */
  tiles: ChoiceTile[] | ChoiceTileGroup[];
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (id: string) => void;
  /** Tiles per row from 640 px; one column below it. */
  columns?: 1 | 2;
}

const isGrouped = (tiles: ChoiceTile[] | ChoiceTileGroup[]): tiles is ChoiceTileGroup[] =>
  tiles.length > 0 && 'tiles' in tiles[0]!;

/**
 * One choice among tiles that each carry an icon, a title and a short description: a question
 * type, a kind of project. Native radios sharing one name, so arrow keys move and select as the
 * browser does and a screen reader hears a radio group; the tile is the label.
 */
export function ChoiceTiles({
  tiles,
  value,
  defaultValue,
  onChange,
  columns = 2,
  ...field
}: ChoiceTilesProps) {
  const [inner, setInner] = useState<string | null>(defaultValue ?? null);
  const current = value === undefined ? inner : value;
  const ids = useFieldIds(field.id);
  const labelId = `${ids.inputId}-label`;
  const group = useId();
  const describedBy = [field.helper && ids.helperId, field.error && ids.errorId]
    .filter(Boolean)
    .join(' ');
  const disabled = field.disabled || field.readOnly || field.locked;
  const groups: ChoiceTileGroup[] = isGrouped(tiles) ? tiles : [{ title: '', tiles }];
  const tile = (t: ChoiceTile) => {
    const selected = current === t.id;
    const off = disabled || t.disabled;
    return (
      <label
        key={t.id}
        className="ui-tile"
        data-selected={selected || undefined}
        data-disabled={off || undefined}
      >
        <input
          type="radio"
          className="ui-sr-only"
          name={field.name ?? group}
          value={t.id}
          checked={selected}
          disabled={off}
          onChange={() => {
            setInner(t.id);
            onChange?.(t.id);
          }}
        />
        {t.icon && (
          <span className="ui-tile-icon" aria-hidden="true">
            <Icon icon={t.icon} size="md" />
          </span>
        )}
        <span className="ui-tile-text">
          <span className="ui-tile-title">{t.title}</span>
          {/* a space between the lines, so the tile's name reads as two words */}
          {t.description && (
            <>
              {' '}
              <span className="ui-tile-desc">{t.description}</span>
            </>
          )}
        </span>
      </label>
    );
  };
  return (
    <div
      className={fieldClass(field)}
      id={ids.inputId}
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={describedBy || undefined}
      aria-invalid={field.error ? true : undefined}
      aria-required={field.required || undefined}
    >
      <NativeFieldLabel {...field} labelId={labelId} />
      {groups.map((g, i) => (
        <div key={g.title || i} className="ui-tile-group">
          {g.title && <div className="ui-tile-group-title">{g.title}</div>}
          <div className="ui-tiles" data-columns={columns}>
            {g.tiles.map(tile)}
          </div>
        </div>
      ))}
    </div>
  );
}
