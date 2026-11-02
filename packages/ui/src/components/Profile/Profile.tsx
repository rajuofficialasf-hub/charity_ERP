import { Check, ChevronDown, Copy } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { fill } from '../../provider/messages.js';
import { useUi } from '../../provider/UiProvider.js';
import { Button } from '../Button/Button.js';
import { cx } from '../../utils/cx.js';
import { Icon, type IconComponent } from '../Icon/Icon.js';

export interface CopyButtonProps {
  /** The text written to the clipboard. */
  value: string;
  /** What is copied, for the button's name ("NID number"). */
  label: string;
  className?: string;
}

/** A small button that copies a value and says so for a moment. */
export function CopyButton({ value, label, className }: CopyButtonProps) {
  const { messages } = useUi();
  // each press is its own result, so a second copy is announced again
  const [result, setResult] = useState<{ press: number; ok: boolean } | null>(null);
  const presses = useRef(0);
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(null), 2000);
    return () => clearTimeout(timer);
  }, [result]);
  const copy = () => {
    presses.current += 1;
    const press = presses.current;
    const done = (ok: boolean) => setResult({ press, ok });
    if (!navigator.clipboard) return done(false);
    navigator.clipboard.writeText(value).then(
      () => done(true),
      () => done(false),
    );
  };
  const copied = result?.ok === true;
  return (
    <span className={cx('ui-copy', className)}>
      <Button variant="ghost" size="sm" iconOnly icon={copied ? Check : Copy} onPress={copy}>
        {fill(messages.profile.copy, { label })}
      </Button>
      <span className="ui-sr-only" role="status" key={result?.press}>
        {result ? fill(messages.profile[result.ok ? 'copied' : 'copyFailed'], { label }) : ''}
      </span>
    </span>
  );
}

export interface ProfileFact {
  id: string;
  /** What the value is ("NID"); written before the value when `showLabel`, else read out only. */
  label: string;
  value: string;
  icon?: IconComponent;
  showLabel?: boolean;
  /** A copy button beside the value. */
  copy?: boolean;
}

export interface ProfileHeaderProps {
  /** The person's name, the page's level-1 heading. */
  name: string;
  /** The photo or the initial avatar. */
  avatar: ReactNode;
  /** The state badges beside the name. */
  status?: ReactNode;
  /** The key facts as chips under the name; leave out what the caller may not see. */
  facts?: ProfileFact[];
  /** The actions: on the right of the banner on a desktop, under the person on a phone. */
  actions?: ReactNode;
  /** Name of the action panel ("Actions"). */
  actionsLabel?: string;
  className?: string;
}

/**
 * The banner of a profile on the brand's dark green: who, the state, the key facts as light
 * chips, and the actions on the right.
 */
export function ProfileHeader({
  name,
  avatar,
  status,
  facts = [],
  actions,
  actionsLabel,
  className,
}: ProfileHeaderProps) {
  return (
    <div className={cx('ui-profile-head', actions ? 'has-actions' : undefined, className)}>
      <div className="ui-profile-who">
        <div className="ui-profile-avatar">{avatar}</div>
        <div className="ui-profile-main">
          <div className="ui-profile-title">
            <h1>{name}</h1>
            {status}
          </div>
          {facts.length > 0 && (
            <ul className="ui-profile-facts">
              {facts.map((fact) => (
                <li key={fact.id} className="ui-profile-fact" title={fact.label}>
                  {fact.icon && <Icon icon={fact.icon} size="sm" />}
                  {fact.showLabel ? (
                    <span>
                      {fact.label}: {fact.value}
                    </span>
                  ) : (
                    <span>
                      <span className="ui-sr-only">{fact.label}: </span>
                      {fact.value}
                    </span>
                  )}
                  {fact.copy && <CopyButton value={fact.value} label={fact.label} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {actions && (
        <div className="ui-profile-actions" role="group" aria-label={actionsLabel}>
          {actions}
        </div>
      )}
    </div>
  );
}

export interface ProfileSectionProps {
  title: string;
  icon?: IconComponent;
  /** Beside the title, outside the toggle: an edit button. */
  action?: ReactNode;
  /** Open at first (default). */
  defaultOpen?: boolean;
  headingLevel?: 2 | 3;
  children?: ReactNode;
  className?: string;
}

/** A section card of a profile whose title opens and closes it. */
export function ProfileSection({
  title,
  icon,
  action,
  defaultOpen = true,
  headingLevel = 2,
  children,
  className,
}: ProfileSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cx('ui-profile-section', open ? 'is-open' : undefined, className)}
    >
      <div className="ui-profile-section-head">
        <Heading id={`${id}-title`} className="ui-profile-section-title">
          <button
            type="button"
            className="ui-profile-toggle"
            aria-expanded={open}
            aria-controls={`${id}-body`}
            onClick={() => setOpen((value) => !value)}
          >
            {icon && (
              <span className="ui-profile-section-icon" aria-hidden="true">
                <Icon icon={icon} size="md" />
              </span>
            )}
            <span className="ui-profile-section-text">{title}</span>
            <Icon icon={ChevronDown} size="sm" className="ui-profile-chevron" />
          </button>
        </Heading>
        {action}
      </div>
      <div id={`${id}-body`} className="ui-profile-section-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

export interface ContactItem {
  id: string;
  icon: IconComponent;
  /** What it is ("Mobile"), read out before the value. */
  label: string;
  value: string;
  /** tel:, mailto: or a web address; the action link opens it. */
  href?: string;
  /** The words of the action link ("Call"). */
  actionLabel?: string;
  /** The action link leads to another site (WhatsApp, Facebook): it opens in a new tab. */
  external?: boolean;
  copy?: boolean;
}

/** The contact rows of a profile: the value, a copy button and an action link. */
export function ContactList({ items, className }: { items: ContactItem[]; className?: string }) {
  return (
    <ul className={cx('ui-contact-list', className)}>
      {items.map((item) => (
        <li key={item.id} className="ui-contact-row">
          <span className="ui-contact-icon" aria-hidden="true">
            <Icon icon={item.icon} size="md" />
          </span>
          <span className="ui-contact-text">
            <span className="ui-contact-label">{item.label}</span>
            <span className="ui-contact-value">{item.value}</span>
          </span>
          {item.copy && <CopyButton value={item.value} label={item.label} />}
          {item.href && item.actionLabel && (
            <Button
              variant="ghost"
              size="sm"
              icon={item.icon}
              href={item.href}
              newTab={item.external}
              className="ui-contact-action"
            >
              {item.actionLabel}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
