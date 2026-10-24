import { ChevronDown } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { Icon, type IconComponent } from '../Icon/Icon.js';

export interface DisclosureProps {
  title: string;
  /** A short note beside the title: a count, "optional". */
  hint?: string;
  icon?: IconComponent;
  /** Open at first (closed by default). */
  defaultOpen?: boolean;
  /** Open or closed from outside; `onToggle` then reports a press. */
  open?: boolean;
  onToggle?: (open: boolean) => void;
  headingLevel?: 2 | 3 | 4;
  children?: ReactNode;
  className?: string;
}

/**
 * A group of settings that opens and closes from its heading, so a long panel shows its parts
 * one at a time (the question settings of the form builder). The heading is a button with
 * `aria-expanded`, as the profile sections do.
 */
export function Disclosure({
  title,
  hint,
  icon,
  defaultOpen = false,
  open,
  onToggle,
  headingLevel = 3,
  children,
  className,
}: DisclosureProps) {
  const [inner, setInner] = useState(defaultOpen);
  const shown = open === undefined ? inner : open;
  const id = useId();
  const Heading = headingLevel === 2 ? 'h2' : headingLevel === 4 ? 'h4' : 'h3';
  return (
    <div
      className={['ui-disclosure', shown ? 'is-open' : undefined, className]
        .filter(Boolean)
        .join(' ')}
    >
      <Heading className="ui-disclosure-heading">
        <button
          type="button"
          className="ui-disclosure-toggle"
          aria-expanded={shown}
          aria-controls={`${id}-body`}
          onClick={() => {
            setInner(!shown);
            onToggle?.(!shown);
          }}
        >
          {icon && (
            <span className="ui-disclosure-icon" aria-hidden="true">
              <Icon icon={icon} size="sm" />
            </span>
          )}
          <span className="ui-disclosure-title">{title}</span>
          {hint && (
            <>
              {' '}
              <span className="ui-disclosure-hint">{hint}</span>
            </>
          )}
          <Icon icon={ChevronDown} size="sm" className="ui-disclosure-chevron" />
        </button>
      </Heading>
      <div id={`${id}-body`} className="ui-disclosure-body" hidden={!shown}>
        {children}
      </div>
    </div>
  );
}
