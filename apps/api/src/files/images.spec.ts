import { describe, expect, it } from 'vitest';
import { gif, jpeg, METADATA_MARKER, png } from '../../test/support/images';
import { cleanImage } from './images';

describe('cleanImage: type by magic bytes and metadata stripped', () => {
  it('removes the JPEG APP1 (Exif) and comment segments and keeps the image bytes', () => {
    const input = jpeg();
    const out = cleanImage(input);
    expect(out?.mime).toBe('image/jpeg');
    expect(out!.bytes.includes(METADATA_MARKER)).toBe(false);
    expect(out!.bytes.equals(jpeg({ metadata: false }))).toBe(true);
  });

  it('removes the PNG text and eXIf chunks and keeps the other chunks', () => {
    const out = cleanImage(png());
    expect(out?.mime).toBe('image/png');
    expect(out!.bytes.includes(METADATA_MARKER)).toBe(false);
    expect(out!.bytes.equals(png({ metadata: false }))).toBe(true);
  });

  it('refuses a GIF, plain text with a JPEG name and a truncated file', () => {
    expect(cleanImage(gif())).toBeNull();
    expect(cleanImage(Buffer.from('just some text, not an image'))).toBeNull();
    expect(cleanImage(jpeg().subarray(0, 12))).toBeNull();
    expect(cleanImage(png().subarray(0, 20))).toBeNull();
    expect(cleanImage(Buffer.alloc(0))).toBeNull();
  });
});
