import {
  Ban,
  BadgeCheck,
  Check,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  ClipboardCheck,
  Clock,
  CloudUpload,
  Flag,
  Hammer,
  Lock,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { cx } from '../../utils/cx.js';
import { Icon, type IconComponent } from '../Icon/Icon.js';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps {
  tone?: BadgeTone;
  /** Required for the status tones: a status is never shown by colour alone (DESIGN_SYSTEM 5.2). */
  icon?: IconComponent;
  /** Visible text (i18n value or bilingual data in the user's language). */
  label: string;
  size?: 'md' | 'sm';
  /** `lang` of the label when it is shown in the other language. */
  lang?: string;
  className?: string;
}

/** Non-interactive pill with an icon and a label (DESIGN_SYSTEM 5.2). */
export function Badge({ tone = 'neutral', icon, label, size = 'md', lang, className }: BadgeProps) {
  return (
    <span
      className={cx('ui-badge', `t-${tone}`, size === 'sm' && 'ui-badge-sm', className)}
      lang={lang}
    >
      {icon && <Icon icon={icon} size="sm" />}
      {label}
    </span>
  );
}

/** Workflow, sync, photo and blocklist states with their fixed tone and icon (DESIGN_SYSTEM 5.2). */
export const STATUS_STYLES = {
  draft: { tone: 'neutral', icon: CircleDashed },
  needs_verification: { tone: 'warning', icon: TriangleAlert },
  submitted: { tone: 'info', icon: Send },
  under_review: { tone: 'info', icon: Search },
  reviewed: { tone: 'info', icon: ClipboardCheck },
  waitlisted: { tone: 'warning', icon: Clock },
  approved: { tone: 'success', icon: CircleCheck },
  rejected: { tone: 'danger', icon: CircleX },
  implementation: { tone: 'brand', icon: Hammer },
  completed: { tone: 'success', icon: BadgeCheck },
  closed: { tone: 'neutral', icon: Lock },
  deleted: { tone: 'neutral', icon: Trash2 },
  sync_pending: { tone: 'neutral', icon: Clock },
  sync_syncing: { tone: 'info', icon: RefreshCw },
  sync_synced: { tone: 'success', icon: Check },
  sync_failed: { tone: 'danger', icon: CircleAlert },
  photo_verified: { tone: 'success', icon: ShieldCheck },
  photo_flagged: { tone: 'warning', icon: Flag },
  photo_pending: { tone: 'neutral', icon: CloudUpload },
  blocklisted: { tone: 'danger', icon: Ban },
} as const satisfies Record<string, { tone: BadgeTone; icon: IconComponent }>;

export type StatusKey = keyof typeof STATUS_STYLES;

export interface StatusBadgeProps {
  status: StatusKey;
  /** The state or stage name in the user's language (bilingual data). */
  label: string;
  size?: 'md' | 'sm';
  lang?: string;
  className?: string;
}

/** Badge whose tone and icon follow the status map; only the label is supplied. */
export function StatusBadge({ status, ...rest }: StatusBadgeProps) {
  // eslint-disable-next-line security/detect-object-injection -- typed union key into a constant table
  const { tone, icon } = STATUS_STYLES[status];
  return <Badge tone={tone} icon={icon} {...rest} />;
}
