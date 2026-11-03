import { Avatar, IconTile, PersonCell } from '@/ui';
import { useFileDataUrl } from './FileImage';

/** The earlier sizes the pages pass, as the asf sizes. */
const AVATAR_SIZE = new Map([
  ['sm', 'small'],
  ['md', 'medium'],
  ['lg', 'large'],
] as const);

const TILE_SIZE = new Map([
  ['sm', 'small'],
  ['md', 'medium'],
  ['lg', 'large'],
] as const);

/**
 * A person's uploaded photo wherever the person is shown, streamed by the API; without one, or
 * while it loads, the initial of the name (docs/DECISION_LOG.md, the official's own profile of
 * 2026-11-02).
 */
export function PersonAvatar({
  fileId,
  name,
  size,
  decorative = true,
  className,
}: {
  fileId: string | null | undefined;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  /** One or two initials in the earlier set; the asf avatar always shows one. */
  letters?: 1 | 2;
  decorative?: boolean;
  /** Layout only, on the element around the avatar. */
  className?: string;
}) {
  const photo = useFileDataUrl(fileId ?? null);
  const avatar = (
    <Avatar
      name={name}
      src={photo.data ?? undefined}
      size={size ? AVATAR_SIZE.get(size) : undefined}
      decorative={decorative}
    />
  );
  return className ? <span className={className}>{avatar}</span> : avatar;
}

/** The first cell of a people list with the person's photo in place of the letter. */
export function PhotoPersonCell({
  fileId,
  name,
  href,
  secondary,
  lang,
}: {
  fileId: string | null | undefined;
  name: string;
  /** The person's or the record's page in the app. */
  href?: string;
  secondary?: string;
  lang?: string;
}) {
  const photo = useFileDataUrl(fileId ?? null);
  return (
    <PersonCell
      name={name}
      to={href}
      secondary={secondary}
      lang={lang}
      photo={photo.data ?? undefined}
    />
  );
}

/** The signed-in person's tile in the header and the sidebar. */
export function PersonTile({
  name,
  fileId,
  size,
}: {
  name: string;
  fileId: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
}) {
  const photo = useFileDataUrl(fileId ?? null);
  return (
    <IconTile
      name={name}
      src={photo.data ?? undefined}
      size={size ? TILE_SIZE.get(size) : undefined}
    />
  );
}
