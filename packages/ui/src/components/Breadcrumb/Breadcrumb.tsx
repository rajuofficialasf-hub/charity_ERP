'use client';

import { ChevronLeft } from 'lucide-react';
import { Breadcrumb as AriaBreadcrumb, Breadcrumbs, Link as AriaLink } from 'react-aria-components';
import { fill } from '../../provider/messages.js';
import { useUi } from '../../provider/UiProvider.js';
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
        <AriaLink href={parent.href} className="ui-breadcrumb-back">
          <Icon icon={ChevronLeft} />
          <span>{fill(messages.nav.backTo, { parent: parent.label })}</span>
        </AriaLink>
      )}
      <Breadcrumbs className="ui-breadcrumb-trail" items={items}>
        {(item) => (
          <AriaBreadcrumb id={item.id} className="ui-breadcrumb-item">
            <AriaLink href={item.href} className="ui-breadcrumb-link">
              <span title={item.label}>{item.label}</span>
            </AriaLink>
          </AriaBreadcrumb>
        )}
      </Breadcrumbs>
    </nav>
  );
}
