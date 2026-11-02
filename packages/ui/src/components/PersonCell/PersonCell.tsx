import { Link as UiLink } from '../../template.js';
import { cx } from '../../utils/cx.js';
import { IconTile } from '../IconTile/IconTile.js';

export interface PersonCellProps {
  name: string;
  /** Opens the person's or the record's page; the name is the link. */
  href?: string;
  /** A muted second line: an id, a type, a family size. */
  secondary?: string;
  /** A photo in place of the letter. */
  photo?: string;
  /** `lang` of the name when it is shown in the other language. */
  lang?: string;
  className?: string;
}

/** The first cell of a people or record list: a letter or photo tile, the name and a second line. */
export function PersonCell({ name, href, secondary, photo, lang, className }: PersonCellProps) {
  return (
    <span className={cx('ui-person', className)}>
      <IconTile name={name} src={photo} size="sm" />
      <span className="ui-person-text">
        {href ? (
          <UiLink href={href} className="ui-person-name" lang={lang}>
            {name}
          </UiLink>
        ) : (
          <span className="ui-person-name" lang={lang}>
            {name}
          </span>
        )}
        {secondary && <span className="ui-person-secondary">{secondary}</span>}
      </span>
    </span>
  );
}
