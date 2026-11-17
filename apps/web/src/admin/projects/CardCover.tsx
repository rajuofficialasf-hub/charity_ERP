import { CoverArt } from '../../components/CoverArt';
import { useFileDataUrl } from '../../components/FileImage';

/**
 * The picture across the top of a program's or a project's card (docs/ui/SCREENS.md, "Project
 * list and project page"): its uploaded cover, streamed by the API as its 1,024 px thumbnail, or
 * the drawing seeded by the record's id while it loads, without one, or when it cannot be shown
 * (a cover the scan has not cleared). It stands beside the card's title, so it is decorative.
 */
export function CardCover({ fileId, seed }: { fileId: string | null; seed: string }) {
  const photo = useFileDataUrl(fileId, 'medium');
  if (!photo.data) return <CoverArt seed={seed} />;
  return (
    <img src={photo.data} alt="" className="card-cover-photo" data-testid="card-cover-photo" />
  );
}
