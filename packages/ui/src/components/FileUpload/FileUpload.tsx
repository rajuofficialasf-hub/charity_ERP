'use client';

import { useId } from 'react';
import {
  Ban,
  Camera,
  CircleAlert,
  CircleCheck,
  Clock,
  FileText,
  Images,
  Minimize2,
  RotateCw,
  ShieldQuestion,
  Upload,
  X,
} from 'lucide-react';
import { DropZone, FileTrigger, Text } from 'react-aria-components';
import { fill } from '../../provider/messages.js';
import { useUi } from '../../provider/UiProvider.js';
import { cx } from '../../utils/cx.js';
import { Badge, type BadgeTone } from '../Badge/Badge.js';
import { Button } from '../Button/Button.js';
import type { IconComponent } from '../Icon/Icon.js';
import { ProgressBar } from '../ProgressBar/ProgressBar.js';
import { FieldLabel, type FieldBaseProps } from '../Field/FieldParts.js';

export type UploadState =
  | 'selected'
  | 'compressing'
  | 'queued'
  | 'uploading'
  | 'quarantined'
  | 'ready'
  | 'failed'
  | 'rejected';

export interface UploadItem {
  id: string;
  name: string;
  state: UploadState;
  /** Local preview (object URL) for images. */
  previewUrl?: string;
  /** 0 to 100 while uploading. */
  progress?: number;
  /** Reason for failed or rejected, in the user's language. */
  reason?: string;
  /** Capture time and location text for photos (BD-21), prepared by the caller. */
  meta?: string;
  /** Files may be removed only before submission (DESIGN_SYSTEM 5.12). */
  removable?: boolean;
}

export interface FileUploadProps extends Pick<
  FieldBaseProps,
  'label' | 'helper' | 'error' | 'required' | 'disabled' | 'className'
> {
  /** camera, gallery or both, from the project's photo-source setting (UX-11). */
  source?: 'camera' | 'gallery' | 'camera_or_gallery' | 'file';
  /** Accepted MIME types, for example ["image/jpeg", "image/png"]. */
  accept?: string[];
  /** Largest accepted size in bytes, and its display text such as "5 MB". */
  maxSize?: number;
  maxSizeText?: string;
  multiple?: boolean;
  maxFiles?: number;
  value: UploadItem[];
  /** Files that passed the type and size checks. */
  onAdd: (files: File[]) => void;
  /** Files that failed a check, with the reason text. */
  onReject?: (file: File, reason: string) => void;
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
}

const STATE_LOOK: Record<UploadState, { tone: BadgeTone; icon: IconComponent }> = {
  selected: { tone: 'neutral', icon: CircleCheck },
  compressing: { tone: 'info', icon: Minimize2 },
  queued: { tone: 'neutral', icon: Clock },
  uploading: { tone: 'info', icon: Upload },
  quarantined: { tone: 'warning', icon: ShieldQuestion },
  ready: { tone: 'success', icon: CircleCheck },
  failed: { tone: 'danger', icon: CircleAlert },
  rejected: { tone: 'danger', icon: Ban },
};

function matches(file: File, accept?: string[]): boolean {
  if (!accept?.length) return true;
  return accept.some((type) =>
    type.endsWith('/*') ? file.type.startsWith(type.slice(0, -1)) : file.type === type,
  );
}

/** File and photo upload with previews and per-file states (DESIGN_SYSTEM 5.12). */
export function FileUpload({
  label,
  helper,
  error,
  required,
  disabled,
  className,
  source = 'file',
  accept,
  maxSize,
  maxSizeText,
  multiple = false,
  maxFiles,
  value,
  onAdd,
  onReject,
  onRemove,
  onRetry,
}: FileUploadProps) {
  const { messages, formatNumber } = useUi();
  const helperId = useId();
  const errorId = useId();
  const limit = maxFiles ?? (multiple ? undefined : 1);
  const full = limit !== undefined && value.length >= limit;

  const take = (list: FileList | File[] | null) => {
    if (!list) return;
    const room = limit === undefined ? Infinity : limit - value.length;
    const accepted: File[] = [];
    for (const file of Array.from(list)) {
      if (!matches(file, accept))
        onReject?.(file, fill(messages.file.wrongType, { name: file.name }));
      else if (maxSize !== undefined && file.size > maxSize)
        onReject?.(
          file,
          fill(messages.file.tooLarge, {
            name: file.name,
            max: maxSizeText ?? formatNumber(maxSize),
          }),
        );
      else if (accepted.length < room) accepted.push(file);
    }
    if (accepted.length) onAdd(accepted);
  };

  const describedBy = [helper && helperId, error && errorId].filter(Boolean).join(' ') || undefined;
  const trigger = (kind: 'camera' | 'gallery' | 'file') => (
    <FileTrigger
      key={kind}
      acceptedFileTypes={accept}
      allowsMultiple={multiple && kind !== 'camera'}
      defaultCamera={kind === 'camera' ? 'environment' : undefined}
      onSelect={take}
    >
      <Button
        variant={kind === 'gallery' ? 'secondary' : 'primary'}
        icon={kind === 'camera' ? Camera : kind === 'gallery' ? Images : Upload}
        disabled={disabled || full}
        aria-describedby={describedBy}
      >
        {kind === 'camera'
          ? messages.file.takePhoto
          : kind === 'gallery'
            ? messages.file.chooseFromGallery
            : messages.file.chooseFile}
      </Button>
    </FileTrigger>
  );
  const kinds: ('camera' | 'gallery' | 'file')[] =
    source === 'camera_or_gallery' ? ['camera', 'gallery'] : [source];

  return (
    <div
      className={cx('ui-field', 'ui-upload', error && 'has-error', className)}
      role="group"
      aria-labelledby={`${helperId}-label`}
    >
      <div id={`${helperId}-label`}>
        <FieldLabel label={label} required={required} elementType="span" />
      </div>
      <DropZone
        className="ui-upload-zone"
        isDisabled={disabled || full}
        getDropOperation={() => 'copy'}
        onDrop={async (event) => {
          const files = await Promise.all(
            event.items
              .filter((item) => item.kind === 'file')
              .map((item) => (item as { getFile: () => Promise<File> }).getFile()),
          );
          take(files);
        }}
      >
        <div className="ui-upload-actions">{kinds.map(trigger)}</div>
        {source !== 'camera' && (
          <Text slot="label" className="ui-upload-drop">
            {messages.file.dropHere}
          </Text>
        )}
      </DropZone>
      {helper && (
        <p className="ui-field-helper" id={helperId}>
          {helper}
          {limit !== undefined && limit > 1 && (
            <>
              {' '}
              ·{' '}
              {fill(messages.file.count, {
                count: formatNumber(value.length),
                max: formatNumber(limit),
              })}
            </>
          )}
        </p>
      )}
      {error && (
        <p className="ui-field-error" id={errorId}>
          <CircleAlert width={16} height={16} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      {value.length > 0 && (
        <ul className="ui-upload-list" aria-live="polite">
          {value.map((item) => {
            const look = STATE_LOOK[item.state];

            const stateText = messages.file.state[item.state];
            return (
              <li key={item.id} className={cx('ui-upload-item', `is-${item.state}`)}>
                <span className="ui-upload-thumb" aria-hidden="true">
                  {item.previewUrl ? (
                    <img src={item.previewUrl} alt="" />
                  ) : (
                    <FileText width={24} height={24} />
                  )}
                </span>
                <div className="ui-upload-info">
                  <p className="ui-upload-name">{item.name}</p>
                  {item.meta && <p className="ui-upload-meta ui-tnum">{item.meta}</p>}
                  <Badge tone={look.tone} icon={look.icon} label={stateText} size="sm" />
                  {item.reason && <p className="ui-upload-reason">{item.reason}</p>}
                  {item.state === 'uploading' && (
                    <ProgressBar
                      value={item.progress ?? 0}
                      max={100}
                      label={item.name}
                      showValue={false}
                      size="sm"
                    />
                  )}
                </div>
                <div className="ui-upload-item-actions">
                  {item.state === 'failed' && onRetry && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={RotateCw}
                      onPress={() => onRetry(item.id)}
                    >
                      {messages.file.retry}
                    </Button>
                  )}
                  {item.removable !== false && onRemove && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={X}
                      iconOnly
                      onPress={() => onRemove(item.id)}
                    >
                      {fill(messages.file.remove, { name: item.name })}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
