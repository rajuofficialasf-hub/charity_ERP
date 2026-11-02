import type { ReactNode } from 'react';
import { cx } from '../../utils/cx.js';

export interface PageHeaderProps {
  /** The page title: the page's only `h1`. */
  title: string;
  /** A short label naming the area of the app, above the title. */
  eyebrow?: string;
  /** A badge or a status beside the title. */
  meta?: ReactNode;
  /** One line: what the page is for, or its context. */
  description?: ReactNode;
  /** The page's buttons, on the right; they wrap under the title on a phone. */
  actions?: ReactNode;
  /** `lang` of the title when it is shown in the other language. */
  lang?: string;
  className?: string;
}

/** The header every signed-in page opens with (DESIGN_SYSTEM 5.3a). */
export function PageHeader({
  title,
  eyebrow,
  meta,
  description,
  actions,
  lang,
  className,
}: PageHeaderProps) {
  return (
    <div className={cx('ui-page-header', className)}>
      <div className="ui-page-header-text">
        {eyebrow && <p className="ui-page-header-eyebrow">{eyebrow}</p>}
        <div className="ui-page-header-title-row">
          <h1 className="ui-page-header-title" lang={lang}>
            {title}
          </h1>
          {meta}
        </div>
        {description && <div className="ui-page-header-description">{description}</div>}
      </div>
      {actions && <div className="ui-page-header-actions">{actions}</div>}
    </div>
  );
}
