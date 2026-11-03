import type { UiLabels, UploadItem, UploadState, ExtendedIconName, FileUploadProps } from '@/ui/contract';

import { useId, useRef } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import FormHelperText from '@mui/material/FormHelperText';
import LinearProgress from '@mui/material/LinearProgress';

import { Icon } from './icon';
import { Chip } from './display';
import { fill, useLabels } from './labels';
import { darkButton, safeImageSrc } from './shared';

// ----------------------------------------------------------------------

type Look = { tone: 'neutral' | 'info' | 'warning' | 'success' | 'error'; icon: ExtendedIconName; label: keyof UiLabels };

const STATE_LOOK = new Map<UploadState, Look>([
  ['selected', { tone: 'neutral', icon: 'check', label: 'uploadSelected' }],
  ['compressing', { tone: 'info', icon: 'refresh', label: 'uploadCompressing' }],
  ['queued', { tone: 'neutral', icon: 'hourglass', label: 'uploadQueued' }],
  ['uploading', { tone: 'info', icon: 'upload', label: 'uploadUploading' }],
  ['quarantined', { tone: 'warning', icon: 'shield', label: 'uploadQuarantined' }],
  ['ready', { tone: 'success', icon: 'success', label: 'uploadReady' }],
  ['failed', { tone: 'error', icon: 'error', label: 'uploadFailed' }],
  ['rejected', { tone: 'error', icon: 'warning', label: 'uploadRejected' }],
]);

/**
 * The type the browser reports. This check only spares the person a wasted upload: the API reads the
 * real type from the file's bytes and enforces the size, so it is no defence on its own.
 */
function accepts(file: File, accept?: readonly string[]) {
  if (!accept?.length) return true;
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return accept.some((entry) => {
    const wanted = entry.toLowerCase();
    if (wanted.startsWith('.')) return name.endsWith(wanted);
    return wanted.endsWith('/*') ? type.startsWith(wanted.slice(0, -1)) : type === wanted;
  });
}

/**
 * A button that opens the browser's file picker through a hidden input; the camera one asks for the
 * back camera. The input is emptied after each choice, so the same file can be picked again.
 */
function Picker({
  label,
  icon,
  accept,
  multiple,
  camera,
  disabled,
  primary,
  onSelect,
}: {
  label: string;
  icon: ExtendedIconName;
  accept?: readonly string[];
  multiple?: boolean;
  camera?: boolean;
  disabled?: boolean;
  primary?: boolean;
  onSelect: (files: FileList | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        // named like its button, so a test or an assistive tool can find the picker it opens
        aria-label={label}
        accept={accept?.join(',')}
        multiple={multiple}
        capture={camera ? 'environment' : undefined}
        onChange={(event) => {
          onSelect(event.target.files);
          event.target.value = '';
        }}
      />
      <Button
        variant={primary ? 'contained' : 'outlined'}
        color="inherit"
        sx={primary ? darkButton : undefined}
        startIcon={<Icon name={icon} size={20} />}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        {label}
      </Button>
    </>
  );
}

function FileRow({ item, onRemove, onRetry }: { item: UploadItem; onRemove?: (id: string) => void; onRetry?: (id: string) => void }) {
  const labels = useLabels();
  const look = STATE_LOOK.get(item.state) ?? { tone: 'neutral', icon: 'file', label: 'uploadSelected' };
  return (
    <Box component="li" sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', p: 1.5, borderRadius: 1.5, border: 1, borderColor: 'divider' }}>
      <Box sx={{ width: 56, height: 56, flexShrink: 0, borderRadius: 1, overflow: 'hidden', display: 'grid', placeItems: 'center', bgcolor: 'action.hover', color: 'text.secondary' }}>
        {safeImageSrc(item.previewUrl) ? <Box component="img" src={safeImageSrc(item.previewUrl)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name="document" size={28} />}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, display: 'grid', gap: 0.5 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
          <Box component="span" sx={{ typography: 'subtitle2', overflowWrap: 'anywhere' }}>
            {item.name}
          </Box>
          <Chip tone={look.tone}>{labels[look.label]}</Chip>
        </Box>
        {item.state === 'uploading' && (
          <LinearProgress variant="determinate" value={item.progress ?? 0} aria-label={item.name} sx={{ borderRadius: 1 }} />
        )}
        {item.meta && (
          <Box component="span" sx={{ typography: 'caption', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
            {item.meta}
          </Box>
        )}
        {item.reason && (
          <Box component="span" sx={(theme) => ({ typography: 'caption', color: 'error.dark', ...theme.applyStyles('dark', { color: 'error.light' }) })}>
            {item.reason}
          </Box>
        )}
        {item.state === 'failed' && onRetry && (
          <Box>
            <Button size="small" color="inherit" startIcon={<Icon name="refresh" size={18} />} onClick={() => onRetry(item.id)}>
              {labels.retryUpload}
            </Button>
          </Box>
        )}
      </Box>
      {item.removable && onRemove && (
        <IconButton aria-label={fill(labels.removeFile, { name: item.name })} onClick={() => onRemove(item.id)}>
          <Icon name="close" size={20} />
        </IconButton>
      )}
    </Box>
  );
}

/** Photos and files: pickers by source, a drop zone, the type and size checks, and each file's state. */
export function FileUpload({
  label,
  error,
  hint,
  required,
  disabled,
  source = 'file',
  accept,
  maxSize,
  maxSizeText,
  multiple,
  maxFiles,
  value,
  onAdd,
  onReject,
  onRemove,
  onRetry,
}: FileUploadProps) {
  const labels = useLabels();
  const labelId = useId();
  const noteId = useId();
  const room = maxFiles === undefined ? Infinity : Math.max(0, maxFiles - value.length);
  const full = room === 0;

  const take = (list: FileList | readonly File[] | null) => {
    if (!list || disabled) return;
    const passed: File[] = [];
    for (const file of Array.from(list)) {
      if (!accepts(file, accept)) onReject?.(file, fill(labels.fileWrongType, { name: file.name }));
      else if (maxSize !== undefined && file.size > maxSize) onReject?.(file, fill(labels.fileTooLarge, { name: file.name, max: maxSizeText ?? String(maxSize) }));
      else passed.push(file);
    }
    const fits = multiple ? room : Math.min(room, 1);
    for (const file of passed.slice(fits)) onReject?.(file, fill(labels.fileLimit, { name: file.name, max: maxFiles ?? 1 }));
    const kept = passed.slice(0, fits);
    if (kept.length > 0) onAdd(kept);
  };

  const pick = { accept, multiple, disabled: disabled || full, onSelect: take };
  return (
    <Box role="group" aria-labelledby={labelId} aria-describedby={error || hint ? noteId : undefined} sx={{ display: 'grid', gap: 1.5 }}>
      <Box id={labelId} sx={{ typography: 'subtitle2' }}>
        {label}
        {required && (
          <Box component="span" aria-hidden sx={{ color: 'error.main' }}>
            {' *'}
          </Box>
        )}
      </Box>
      <Box
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          take(event.dataTransfer.files);
        }}
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1.5,
          p: 2,
          borderRadius: 1.5,
          border: '1px dashed',
          borderColor: error ? 'error.main' : 'divider',
          bgcolor: 'action.hover',
        }}
      >
        {(source === 'camera' || source === 'camera_or_gallery') && <Picker label={labels.takePhoto} icon="camera" camera primary {...pick} />}
        {(source === 'gallery' || source === 'camera_or_gallery') && <Picker label={labels.chooseFromGallery} icon="gallery" {...pick} />}
        {source === 'file' && <Picker label={labels.chooseFile} icon="upload" primary {...pick} />}
        <Box component="span" sx={{ typography: 'body2', color: 'text.secondary', display: { xs: 'none', md: 'inline' } }}>
          {labels.dropHere}
        </Box>
        {maxFiles !== undefined && (
          <Box component="span" sx={{ ml: 'auto', typography: 'caption', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
            {fill(labels.fileCount, { count: value.length, max: maxFiles })}
          </Box>
        )}
      </Box>
      {(error || hint) && (
        <FormHelperText id={noteId} error={Boolean(error)} sx={{ mt: -0.5 }}>
          {error ?? hint}
        </FormHelperText>
      )}
      {value.length > 0 && (
        <Box component="ul" aria-label={label} sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
          {value.map((item) => (
            <FileRow key={item.id} item={item} onRemove={onRemove} onRetry={onRetry} />
          ))}
        </Box>
      )}
    </Box>
  );
}
