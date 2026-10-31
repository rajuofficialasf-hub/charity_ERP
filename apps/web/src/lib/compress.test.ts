import { afterEach, describe, expect, it, vi } from 'vitest';
import { compressImage } from './compress';

// The compressor on a browser that draws: the canvas is stood in for, its JPEG size following
// the quality and the side, so the loop's choices can be checked without real pictures.
const KB = 1024;

function fakeCanvas(bytesAt: (quality: number, side: number) => number) {
  const bitmap = { width: 4000, height: 3000, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap),
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback,
    _type,
    quality,
  ) {
    const size = bytesAt(typeof quality === 'number' ? quality : 0.92, this.width);
    callback(new Blob([new Uint8Array(size)], { type: 'image/jpeg' }));
  });
  return bitmap;
}

afterEach(() => vi.restoreAllMocks());

describe('compressImage', () => {
  it('stops at the first quality that brings a large photo under the target', async () => {
    const bitmap = fakeCanvas((quality) => Math.round(quality * 500 * KB));
    const file = new File([new Uint8Array(4 * 1024 * KB)], 'big.jpg', { type: 'image/jpeg' });
    const out = await compressImage(file);
    // 0.82 → 410 KB, 0.7 → 350 KB, 0.6 → 300 KB: the target
    expect(out.size).toBe(300 * KB);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('shrinks the side when no quality is enough, and keeps the smallest result', async () => {
    fakeCanvas((quality, side) => Math.round(quality * side * 400));
    const file = new File([new Uint8Array(4 * 1024 * KB)], 'huge.jpg', { type: 'image/jpeg' });
    const out = await compressImage(file);
    // 1600 px: even 0.5 gives 320 KB; 1280 px: 0.6 lands exactly on the target
    expect(out.size).toBe(Math.round(0.6 * 1280 * 400));
    const stubborn = await compressImage(
      new File([new Uint8Array(4 * 1024 * KB)], 'stubborn.jpg', { type: 'image/jpeg' }),
      100 * KB,
    );
    // never under 100 KB: the smallest of the three sides at the lowest quality
    expect(stubborn.size).toBe(Math.round(0.5 * 1024 * 400));
  });

  it('gives the file back where the browser cannot draw', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    const file = new File([new Uint8Array(10)], 'tiny.jpg', { type: 'image/jpeg' });
    expect(await compressImage(file)).toBe(file);
  });
});
