'use client';

import { ChevronLeft } from 'lucide-react';
import { fill } from '../../provider/messages.js';
import { useUi } from '../../provider/UiProvider.js';
import { Link as UiLink } from '../../template.js';
import { cx } from '../../utils/cx.js';
import { Icon } from '../Icon/Icon.js';

export interface BreadcrumbItem {
  id: string;
  label: string;
  /** Omitted for the current page (the last item). */
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

/**
 * Breadcrumb trail from 640 px; on phones a back link with the parent's name replaces it
 * (DESIGN_SYSTEM 5.14). The current page carries aria-current="page".
 */
export function Breadcrumb({ items, className }: BreadcrumbProps) {
  const { messages } = useUi();
  const parent = items.length > 1 ? items[items.length - 2] : undefined;
  return (
    <nav className={cx('ui-breadcrumb', className)} aria-label={messages.nav.breadcrumb}>
      {parent?.href && (
        <UiLink href={parent.href} className="ui-breadcrumb-back">
          <Icon icon={ChevronLeft} />
          <span>{fill(messages.nav.backTo, { parent: parent.label })}</span>
        </UiLink>
      )}
      <ol className="ui-breadcrumb-trail">
        {items.map((item, i) => {
          const current = i === items.length - 1;
          const label = <span title={item.label}>{item.label}</span>;
          return (
            <li key={item.id} className="ui-breadcrumb-item">
              {current || !item.href ? (
                <span className="ui-breadcrumb-link" aria-current={current ? 'page' : undefined}>
                  {label}
                </span>
              ) : (
                <UiLink href={item.href} className="ui-breadcrumb-link">
                  {label}
                </UiLink>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
