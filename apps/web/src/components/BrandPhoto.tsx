import './brand-photo.css';

/** A one-pixel transparent image: what a phone loads in place of the photo. */
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const DESKTOP = '(min-width: 1024px)';

/**
 * The photo of the Foundation's building beside the sign-in and registration forms. Shown only
 * from 1024 px: a phone neither shows nor downloads it, so the form loads light on a slow network.
 * Decoration, so it has no text for screen readers.
 */
export function BrandPhoto({ className }: { className?: string }) {
  return (
    <picture className={className ? `brand-photo ${className}` : 'brand-photo'}>
      <source
        media={DESKTOP}
        type="image/webp"
        srcSet="/brand/building-640.webp 640w, /brand/building-960.webp 960w"
        sizes="40vw"
      />
      <source media={DESKTOP} srcSet="/brand/building-960.jpg" />
      <img src={BLANK} alt="" width={960} height={1440} />
    </picture>
  );
}
