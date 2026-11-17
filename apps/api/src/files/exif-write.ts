import { Transform, type TransformCallback } from 'node:stream';
import { crc32 } from 'node:zlib';
import { dhakaClock } from '../core/dhaka-day.js';
import { jpegDropped, PNG_DROPPED, PNG_SIGNATURE, scanByte } from './images.js';

/**
 * A downloaded photo carries the capture time and the position the server keeps, written into the
 * file as EXIF (docs/architecture/FILES_AND_DOCUMENTS.md, "Download of a photo"); the stored photo
 * stays as it is. Each container is rewritten as a stream: the metadata it still holds is dropped
 * (the same parts `images.ts` strips from an upload), the new block is put where its format keeps
 * it, and the pixels pass untouched. Nothing is held whole in memory: a JPEG and a PNG are walked
 * segment by segment and chunk by chunk, and a WebP is read twice, first for its chunk list (its
 * RIFF length at the start depends on every chunk), then to write it.
 */
export interface WrittenMetadata {
  capturedAt: Date | null;
  gps: { lat: number; lng: number; accuracyM: number | null } | null;
}

/** A stored photo whose container cannot be walked: damaged, cut off, or not its stored type. */
export class UnreadablePhoto extends Error {
  constructor(readonly reason: string) {
    super(`photo unreadable: ${reason}`);
    this.name = 'UnreadablePhoto';
  }
}

/** More bytes than this before the image data is no photo a phone or a camera makes. */
const HEAD_LIMIT = 1024 * 1024;

// ---------------------------------------------------------------------------------------------
// The EXIF block: one little-endian TIFF structure with the main directory pointing at the EXIF
// directory (the time) and the GPS directory (the position).

const BYTE = 1;
const ASCII = 2;
const LONG = 4;
const RATIONAL = 5;

interface Field {
  tag: number;
  type: number;
  count: number;
  data: Buffer;
}

const ascii = (tag: number, text: string): Field => ({
  tag,
  type: ASCII,
  count: text.length + 1,
  data: Buffer.from(`${text}\0`, 'latin1'),
});
const long = (tag: number, value: number): Field => {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(value);
  return { tag, type: LONG, count: 1, data };
};
const rationals = (tag: number, pairs: [number, number][]): Field => {
  const data = Buffer.alloc(8 * pairs.length);
  pairs.forEach(([n, d], i) => {
    data.writeUInt32LE(n, i * 8);
    data.writeUInt32LE(d, i * 8 + 4);
  });
  return { tag, type: RATIONAL, count: pairs.length, data };
};

/** A directory's size: its entries, the next-directory link, and its values over four bytes. */
const directorySize = (fields: Field[]) =>
  fields.reduce(
    (size, f) => size + (f.data.length > 4 ? f.data.length + (f.data.length & 1) : 0),
    2 + fields.length * 12 + 4,
  );

function writeDirectory(out: Buffer, start: number, fields: Field[]): void {
  out.writeUInt16LE(fields.length, start);
  let values = start + 2 + fields.length * 12 + 4;
  fields.forEach((f, i) => {
    const entry = start + 2 + i * 12;
    out.writeUInt16LE(f.tag, entry);
    out.writeUInt16LE(f.type, entry + 2);
    out.writeUInt32LE(f.count, entry + 4);
    if (f.data.length <= 4) f.data.copy(out, entry + 8);
    else {
      out.writeUInt32LE(values, entry + 8);
      f.data.copy(out, values);
      values += f.data.length + (f.data.length & 1);
    }
  });
  out.writeUInt32LE(0, start + 2 + fields.length * 12);
}

/** Degrees as degrees, minutes and seconds, the seconds to a ten-thousandth. */
function degrees(value: number): [number, number][] {
  const total = Math.round(Math.abs(value) * 3600 * 10_000);
  const deg = Math.floor(total / 36_000_000);
  const min = Math.floor((total % 36_000_000) / 600_000);
  return [
    [deg, 1],
    [min, 1],
    [total % 600_000, 10_000],
  ];
}

/** The EXIF block of the time and the position, or null when there is neither to write. */
export function exifBlock(meta: WrittenMetadata): Buffer | null {
  const time = meta.capturedAt
    ? [
        ascii(0x9003, dhakaClock(meta.capturedAt).replace(/-/g, ':').replace('T', ' ')),
        ascii(0x9011, '+06:00'),
      ]
    : [];
  const gps = meta.gps
    ? [
        { tag: 0x0000, type: BYTE, count: 4, data: Buffer.from([2, 3, 0, 0]) },
        ascii(0x0001, meta.gps.lat < 0 ? 'S' : 'N'),
        rationals(0x0002, degrees(meta.gps.lat)),
        ascii(0x0003, meta.gps.lng < 0 ? 'W' : 'E'),
        rationals(0x0004, degrees(meta.gps.lng)),
        ...(meta.gps.accuracyM === null
          ? []
          : [rationals(0x001f, [[Math.round(meta.gps.accuracyM * 100), 100]])]),
      ]
    : [];
  if (!time.length && !gps.length) return null;
  const main = [
    ...(time.length ? [long(0x8769, 0)] : []),
    ...(gps.length ? [long(0x8825, 0)] : []),
  ];
  const atTime = 8 + directorySize(main);
  const atGps = atTime + (time.length ? directorySize(time) : 0);
  if (time.length) main[0]!.data.writeUInt32LE(atTime);
  if (gps.length) main[main.length - 1]!.data.writeUInt32LE(atGps);
  const out = Buffer.alloc(atGps + (gps.length ? directorySize(gps) : 0));
  out.write('II', 0, 'latin1');
  out.writeUInt16LE(42, 2);
  out.writeUInt32LE(8, 4);
  writeDirectory(out, 8, main);
  if (time.length) writeDirectory(out, atTime, time);
  if (gps.length) writeDirectory(out, atGps, gps);
  return out;
}

// ---------------------------------------------------------------------------------------------
// A walk over a stream: the bytes not yet used wait in `pending`, which holds at most a header.

abstract class ContainerWriter extends Transform {
  protected pending: Buffer = Buffer.alloc(0);
  /** Output held back until the image data starts, so a refusal comes before any byte is sent. */
  private held: Buffer[] | null = [];
  private headBytes = 0;
  protected finished = false;

  constructor(protected readonly exif: Buffer | null) {
    super();
  }

  override _transform(chunk: Buffer, _enc: BufferEncoding, done: TransformCallback): void {
    try {
      this.pending = this.pending.length ? Buffer.concat([this.pending, chunk]) : chunk;
      const used = this.walk(this.pending);
      this.pending = Buffer.from(this.pending.subarray(used));
      done();
    } catch (error) {
      done(error as Error);
    }
  }

  override _flush(done: TransformCallback): void {
    try {
      if (!this.finished) throw new UnreadablePhoto('truncated');
      this.end_();
      this.release();
      done();
    } catch (error) {
      done(error as Error);
    }
  }

  /** Walks what is there and answers how many bytes it used. */
  protected abstract walk(bytes: Buffer): number;

  /** What the container adds after its last byte. */
  protected end_(): void {}

  protected out(bytes: Buffer): void {
    if (!bytes.length) return;
    if (this.held) this.held.push(Buffer.from(bytes));
    else this.push(bytes);
  }

  /** Counts the bytes read before the image data against the limit. */
  protected head(count: number): void {
    if (!this.held) return;
    this.headBytes += count;
    if (this.headBytes > HEAD_LIMIT) throw new UnreadablePhoto('metadata_too_large');
  }

  /** The image data starts: what was held goes out. */
  protected release(): void {
    if (!this.held) return;
    for (const part of this.held) this.push(part);
    this.held = null;
  }
}

/** JPEG: the new APP1 after the start marker; APP1 to APP15 (but Adobe's) and COM dropped. */
class JpegWriter extends ContainerWriter {
  private state: 'start' | 'marker' | 'segment' | 'scan' | 'done' = 'start';
  private remaining = 0;
  private keep = false;
  private scanHeader = false;
  private scanned = false;

  protected walk(d: Buffer): number {
    let at = 0;
    for (;;) {
      const left = d.length - at;
      if (this.state === 'done') {
        this.head(left);
        return d.length; // anything after the end of the image goes
      }
      if (this.state === 'start') {
        if (left < 2) return at;
        if (d[at] !== 0xff || d[at + 1] !== 0xd8) throw new UnreadablePhoto('not_jpeg');
        this.out(d.subarray(at, at + 2));
        if (this.exif) {
          const header = Buffer.alloc(10);
          header.writeUInt16BE(0xffe1, 0);
          header.writeUInt16BE(2 + 6 + this.exif.length, 2);
          header.write('Exif\0\0', 4, 'latin1');
          this.out(Buffer.concat([header, this.exif]));
        }
        this.head(2);
        at += 2;
        this.state = 'marker';
      } else if (this.state === 'marker') {
        if (left < 2) return at;
        if (d[at] !== 0xff) throw new UnreadablePhoto('marker');
        const marker = d[at + 1]!;
        if (marker === 0xff) {
          this.head(1);
          at += 1; // a fill byte
          continue;
        }
        if (marker === 0xd9) {
          if (!this.scanned) throw new UnreadablePhoto('no_image');
          this.out(d.subarray(at, at + 2));
          at += 2;
          this.state = 'done';
          this.finished = true;
          continue;
        }
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7))
          throw new UnreadablePhoto('marker');
        if (left < 4) return at;
        const length = d.readUInt16BE(at + 2);
        if (length < 2) throw new UnreadablePhoto('segment');
        this.keep = !jpegDropped(marker);
        this.scanHeader = marker === 0xda;
        if (this.keep) this.out(d.subarray(at, at + 4));
        this.head(4);
        at += 4;
        this.remaining = length - 2;
        this.state = 'segment';
      } else if (this.state === 'segment') {
        const n = Math.min(this.remaining, left);
        if (this.keep) this.out(d.subarray(at, at + n));
        this.head(n);
        at += n;
        this.remaining -= n;
        if (this.remaining > 0) return at;
        if (this.scanHeader) {
          this.scanned = true;
          this.release();
          this.state = 'scan';
        } else this.state = 'marker';
      } else {
        // the image data runs to the first marker that is no stuffed byte and no restart
        const ff = d.indexOf(0xff, at);
        if (ff < 0) {
          this.out(d.subarray(at));
          return d.length;
        }
        if (ff === d.length - 1) {
          this.out(d.subarray(at, ff));
          return ff;
        }
        if (scanByte(d[ff + 1]!)) {
          this.out(d.subarray(at, ff + 2));
          at = ff + 2;
          continue;
        }
        this.out(d.subarray(at, ff));
        at = ff;
        this.state = 'marker';
      }
    }
  }
}

const pngChunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
};

/** PNG: the new eXIf chunk before the first image data; text, eXIf and tIME chunks dropped. */
class PngWriter extends ContainerWriter {
  private state: 'signature' | 'header' | 'data' | 'done' = 'signature';
  private remaining = 0;
  private keep = false;
  private last = false;
  private imageSeen = false;

  protected walk(d: Buffer): number {
    let at = 0;
    for (;;) {
      const left = d.length - at;
      if (this.state === 'done') return d.length;
      if (this.state === 'signature') {
        if (left < 8) return at;
        if (!d.subarray(at, at + 8).equals(PNG_SIGNATURE)) throw new UnreadablePhoto('not_png');
        this.out(d.subarray(at, at + 8));
        this.head(8);
        at += 8;
        this.state = 'header';
      } else if (this.state === 'header') {
        if (left < 8) return at;
        const length = d.readUInt32BE(at);
        if (length > 0x7fff_ffff) throw new UnreadablePhoto('chunk');
        const type = d.toString('latin1', at + 4, at + 8);
        if (type === 'IDAT' && !this.imageSeen) {
          this.imageSeen = true;
          if (this.exif) this.out(pngChunk('eXIf', this.exif));
          this.release();
        }
        this.keep = !PNG_DROPPED.has(type);
        this.last = type === 'IEND';
        if (this.last && !this.imageSeen) throw new UnreadablePhoto('no_image');
        if (this.keep) this.out(d.subarray(at, at + 8));
        this.head(8);
        at += 8;
        this.remaining = length + 4; // the data and its check sum
        this.state = 'data';
      } else {
        const n = Math.min(this.remaining, left);
        if (this.keep) this.out(d.subarray(at, at + n));
        this.head(n);
        at += n;
        this.remaining -= n;
        if (this.remaining > 0) return at;
        if (this.last) {
          this.state = 'done';
          this.finished = true;
        } else this.state = 'header';
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// WebP: a RIFF file of chunks. The EXIF and XMP chunks are dropped, the extended header (VP8X)
// says that an EXIF chunk follows (one is made from the frame's size when the file has none), and
// the new EXIF chunk ends the file.

const IMAGE_CHUNKS = new Set(['VP8 ', 'VP8L', 'ANIM', 'ANMF']);
const WEBP_DROPPED = new Set(['EXIF', 'XMP ']);
const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;
const VP8X_ALPHA = 0x10;

/** What the first pass over a WebP learns: its chunks, and its canvas when it has no VP8X. */
export interface WebpLayout {
  chunks: { type: string; size: number }[];
  width: number;
  height: number;
  alpha: boolean;
}

/** Reads exactly the bytes asked for from a stream of pieces. */
class PieceReader {
  private buffered: Buffer = Buffer.alloc(0);
  private readonly pieces: AsyncIterator<Buffer>;

  constructor(source: AsyncIterable<Buffer>) {
    this.pieces = source[Symbol.asyncIterator]();
  }

  private async more(): Promise<boolean> {
    const next = await this.pieces.next();
    if (next.done) return false;
    this.buffered = this.buffered.length ? Buffer.concat([this.buffered, next.value]) : next.value;
    return true;
  }

  async read(n: number): Promise<Buffer> {
    while (this.buffered.length < n)
      if (!(await this.more())) throw new UnreadablePhoto('truncated');
    const out = this.buffered.subarray(0, n);
    this.buffered = this.buffered.subarray(n);
    return out;
  }

  async skip(n: number): Promise<void> {
    while (n > 0) {
      if (!this.buffered.length && !(await this.more())) throw new UnreadablePhoto('truncated');
      const k = Math.min(n, this.buffered.length);
      this.buffered = this.buffered.subarray(k);
      n -= k;
    }
  }
}

/** The first pass over a stored WebP of `size` bytes: its chunks and its canvas. */
export async function webpLayout(source: AsyncIterable<Buffer>, size: number): Promise<WebpLayout> {
  const reader = new PieceReader(source);
  const riff = await reader.read(12);
  if (riff.toString('latin1', 0, 4) !== 'RIFF' || riff.toString('latin1', 8, 12) !== 'WEBP')
    throw new UnreadablePhoto('not_webp');
  if (riff.readUInt32LE(4) + 8 !== size) throw new UnreadablePhoto('riff_length');
  const layout: WebpLayout = { chunks: [], width: 0, height: 0, alpha: false };
  let at = 12;
  let imageSeen = false;
  while (at < size) {
    if (size - at < 8) throw new UnreadablePhoto('chunk');
    const header = await reader.read(8);
    const type = header.toString('latin1', 0, 4);
    const length = header.readUInt32LE(4);
    const padded = length + (length & 1);
    if (at + 8 + padded > size) throw new UnreadablePhoto('chunk');
    if (!imageSeen && IMAGE_CHUNKS.has(type)) {
      imageSeen = true;
      if (at > HEAD_LIMIT) throw new UnreadablePhoto('metadata_too_large');
    }
    let read = 0;
    if ((type === 'VP8 ' || type === 'VP8L') && !layout.width && length >= 10) {
      const start = await reader.read(10);
      read = 10;
      if (type === 'VP8 ') {
        layout.width = start.readUInt16LE(6) & 0x3fff;
        layout.height = start.readUInt16LE(8) & 0x3fff;
      } else {
        const bits = start.readUInt32LE(1);
        layout.width = (bits & 0x3fff) + 1;
        layout.height = ((bits >>> 14) & 0x3fff) + 1;
        layout.alpha = ((bits >>> 28) & 1) === 1;
      }
    }
    await reader.skip(padded - read);
    layout.chunks.push({ type, size: length });
    at += 8 + padded;
  }
  if (!imageSeen) throw new UnreadablePhoto('no_image');
  return layout;
}

const padded = (n: number) => n + (n & 1);

class WebpWriter extends ContainerWriter {
  private state: 'riff' | 'header' | 'data' = 'riff';
  private index = 0;
  private remaining = 0;
  private keep = false;
  private flagsAt: number | null = null;
  private readonly hasVp8x: boolean;

  constructor(
    exif: Buffer | null,
    private readonly layout: WebpLayout,
  ) {
    super(exif);
    this.hasVp8x = layout.chunks.some((c) => c.type === 'VP8X');
  }

  /** The RIFF length of the written file. */
  private size(): number {
    const kept = this.layout.chunks
      .filter((c) => !WEBP_DROPPED.has(c.type))
      .reduce((sum, c) => sum + 8 + padded(c.size), 0);
    const header = !this.hasVp8x && this.exif ? 18 : 0;
    const exif = this.exif ? 8 + padded(this.exif.length) : 0;
    return 4 + header + kept + exif;
  }

  protected walk(d: Buffer): number {
    let at = 0;
    for (;;) {
      const left = d.length - at;
      if (this.state === 'riff') {
        if (left < 12) return at;
        const riff = Buffer.from(d.subarray(at, at + 12));
        riff.writeUInt32LE(this.size(), 4);
        this.out(riff);
        if (!this.hasVp8x && this.exif) {
          const vp8x = Buffer.alloc(18);
          vp8x.write('VP8X', 0, 'latin1');
          vp8x.writeUInt32LE(10, 4);
          vp8x.writeUInt8(VP8X_EXIF | (this.layout.alpha ? VP8X_ALPHA : 0), 8);
          vp8x.writeUIntLE(this.layout.width - 1, 12, 3);
          vp8x.writeUIntLE(this.layout.height - 1, 15, 3);
          this.out(vp8x);
        }
        at += 12;
        this.release();
        this.state = this.layout.chunks.length ? 'header' : 'riff';
        if (!this.layout.chunks.length) throw new UnreadablePhoto('no_image');
      } else if (this.state === 'header') {
        if (this.index >= this.layout.chunks.length) {
          if (left) throw new UnreadablePhoto('changed');
          return at;
        }
        if (left < 8) return at;
        const type = d.toString('latin1', at, at + 4);
        const length = d.readUInt32LE(at + 4);
        const expected = this.layout.chunks[this.index]!;
        if (type !== expected.type || length !== expected.size)
          throw new UnreadablePhoto('changed');
        this.keep = !WEBP_DROPPED.has(type);
        if (this.keep) this.out(d.subarray(at, at + 8));
        this.flagsAt = type === 'VP8X' ? 0 : null;
        at += 8;
        this.remaining = padded(length);
        this.state = 'data';
      } else {
        if (this.remaining && this.flagsAt === 0) {
          // the extended header's first byte: an EXIF chunk follows, no XMP chunk does
          const flags = (d[at]! & ~VP8X_XMP & ~VP8X_EXIF) | (this.exif ? VP8X_EXIF : 0);
          this.out(Buffer.from([flags]));
          this.flagsAt = null;
          at += 1;
          this.remaining -= 1;
          continue;
        }
        const n = Math.min(this.remaining, left);
        if (this.keep) this.out(d.subarray(at, at + n));
        at += n;
        this.remaining -= n;
        if (this.remaining > 0) return at;
        this.index += 1;
        this.state = 'header';
        if (this.index === this.layout.chunks.length) this.finished = true;
      }
    }
  }

  protected override end_(): void {
    if (!this.exif) return;
    const header = Buffer.alloc(8);
    header.write('EXIF', 0, 'latin1');
    header.writeUInt32LE(this.exif.length, 4);
    this.out(Buffer.concat([header, this.exif, Buffer.alloc(this.exif.length & 1)]));
  }
}

/**
 * The writer for a stored photo of `mime`: it takes the stored bytes and gives the download, and
 * fails with `UnreadablePhoto` before giving any byte when the container cannot be walked. A WebP
 * needs the layout of its first pass.
 */
export function metadataWriter(
  mime: string,
  meta: WrittenMetadata,
  layout?: WebpLayout,
): Transform {
  const exif = exifBlock(meta);
  switch (mime) {
    case 'image/jpeg':
      return new JpegWriter(exif);
    case 'image/png':
      return new PngWriter(exif);
    case 'image/webp':
      if (!layout) throw new Error('a WebP is written from the layout of its first pass');
      return new WebpWriter(exif, layout);
    default:
      throw new UnreadablePhoto('type');
  }
}
