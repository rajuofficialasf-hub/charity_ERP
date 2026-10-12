import { crc32 } from 'node:zlib';

/**
 * Tiny JPEG and PNG files for the photo tests: valid container structure (markers and chunks)
 * with a metadata segment that carries a marker text, so a test can prove it was stripped.
 */
export const METADATA_MARKER = 'GPS-23.8103-90.4125';

const segment = (marker: number, data: Buffer) => {
  const head = Buffer.alloc(4);
  head.writeUInt16BE(0xff00 | marker, 0);
  head.writeUInt16BE(data.length + 2, 2);
  return Buffer.concat([head, data]);
};

export function jpeg(
  options: { pad?: number; metadata?: boolean; trailer?: boolean; scans?: number } = {},
): Buffer {
  const jfif = Buffer.from([0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const exif = Buffer.concat([Buffer.from('Exif\0\0'), Buffer.from(METADATA_MARKER)]);
  const comment = Buffer.from(`comment ${METADATA_MARKER}`);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, jfif),
    ...(options.metadata === false ? [] : [segment(0xe1, exif), segment(0xfe, comment)]),
    segment(0xdb, Buffer.from([0, 0])),
    ...Array.from({ length: options.scans ?? 1 }, (_, i) => [
      // a progressive JPEG may carry metadata between its scans
      ...(i > 0 && options.metadata !== false ? [segment(0xe1, exif)] : []),
      ...(i > 0 ? [segment(0xc4, Buffer.from([0, 1]))] : []),
      segment(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
      // scan data with a stuffed byte and a restart marker, which are not segment markers
      Buffer.from([0x53, 0xff, 0x00, 0x43, 0xff, 0xd0, 0x41]),
    ]).flat(),
    Buffer.alloc(options.pad ?? 0, 0x11),
    Buffer.from([0xff, 0xd9]),
    // phones append second images or motion clips after the end marker, with their own Exif
    ...(options.trailer
      ? [Buffer.from([0xff, 0xd8]), segment(0xe1, exif), Buffer.from([0xff, 0xd9])]
      : []),
  ]);
}

const chunk = (type: string, data: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

export function png(options: { metadata?: boolean } = {}): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...(options.metadata === false
      ? []
      : [
          chunk('tEXt', Buffer.from(`Location\0${METADATA_MARKER}`, 'latin1')),
          chunk('eXIf', Buffer.from(METADATA_MARKER)),
        ]),
    chunk('IDAT', Buffer.from('pixels')),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** The first bytes of a GIF. */
export const gif = () => Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1');
