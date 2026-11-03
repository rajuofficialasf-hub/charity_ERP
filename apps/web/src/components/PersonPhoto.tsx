import { Avatar, type AvatarProps, IconTile, PersonCell, type PersonCellProps } from '@css/ui';
import { useFileDataUrl } from './FileImage';

/**
 * A person's uploaded photo wherever the person is shown, streamed by the API; without one, or
 * while it loads, the initial of the name (docs/DECISION_LOG.md, the official's own profile of
 * 2026-11-02).
 */
export function PersonAvatar({
  fileId,
  ...props
}: AvatarProps & { fileId: string | null | undefined }) {
  const photo = useFileDataUrl(fileId ?? null);
  return <Avatar {...props} src={photo.data ?? undefined} />;
}

/** The first cell of a people list with the person's photo in place of the letter. */
export function PhotoPersonCell({
  fileId,
  ...props
}: Omit<PersonCellProps, 'photo'> & { fileId: string | null | undefined }) {
  const photo = useFileDataUrl(fileId ?? null);
  return <PersonCell {...props} photo={photo.data ?? undefined} />;
}

/** The signed-in person's tile in the app bar and the sidebar. */
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
  return <IconTile name={name} src={photo.data ?? undefined} {...(size ? { size } : {})} />;
}
