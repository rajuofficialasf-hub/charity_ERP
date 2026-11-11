import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assertKey } from '../storage/index.js';
import { bucketOf, detectType, objectKeyOf } from './policy.js';

// The type of an upload by its first bytes, and the bucket and key of each kind.
const bytes = (...parts: (string | number[])[]) =>
  Buffer.concat(
    parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p))),
  );

describe('the type of a file by its first bytes', () => {
  it('knows every allowed type', () => {
    expect(detectType(bytes([0xff, 0xd8, 0xff, 0xe0], '0000'))).toBe('image/jpeg');
    expect(detectType(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'IHDR'))).toBe(
      'image/png',
    );
    expect(detectType(bytes('RIFF', [1, 2, 3, 4], 'WEBPVP8 '))).toBe('image/webp');
    expect(detectType(bytes([0, 0, 0, 0x18], 'ftypheic', [0, 0, 0, 0]))).toBe('image/heic');
    expect(detectType(bytes([0, 0, 0, 0x18], 'ftypmif1', [0, 0, 0, 0]))).toBe('image/heif');
    expect(detectType(bytes('%PDF-1.7\n'))).toBe('application/pdf');
  });

  it('refuses an SVG, an HTML page, a video and anything too short, whatever the name says', () => {
    for (const refused of [
      bytes('<svg xmlns="http://www.w3.org/2000/svg">'),
      bytes('<!DOCTYPE html><html>'),
      bytes('<html><script>'),
      bytes([0, 0, 0, 0x18], 'ftypisom', [0, 0, 0, 0]),
      bytes([0xff, 0xd8]),
      Buffer.alloc(0),
    ])
      expect(detectType(refused)).toBeNull();
  });
});

describe('the bucket and key of an upload', () => {
  const base = {
    fileId: randomUUID(),
    type: 'image/jpeg' as const,
    entityId: randomUUID(),
    projectCode: 'WC26',
    programCode: 'HUM',
    year: 2026,
    applicationId: null,
    districtCode: null,
  };

  it('puts photos under the project and the application, vouchers by record, documents by place', () => {
    const app = randomUUID();
    const photo = objectKeyOf({
      ...base,
      kind: 'distribution_proof',
      entityType: 'activity',
      applicationId: app,
    });
    expect(bucketOf('distribution_proof')).toBe('photos');
    expect(photo).toBe(`WC26/${app}/distribution_proof/${base.fileId}.jpg`);
    expect(objectKeyOf({ ...base, kind: 'issue_photo', entityType: 'issue' })).toBe(
      `WC26/issues/${base.entityId}/${base.fileId}.jpg`,
    );
    expect(bucketOf('voucher')).toBe('vouchers');
    expect(
      objectKeyOf({
        ...base,
        kind: 'voucher',
        entityType: 'expense_claim',
        type: 'application/pdf',
      }),
    ).toBe(`WC26/claims/${base.entityId}/${base.fileId}.pdf`);
    expect(bucketOf('document')).toBe('documents');
    expect(
      objectKeyOf({ ...base, kind: 'document', entityType: 'document', type: 'application/pdf' }),
    ).toBe(`HUM/WC26/2026/_central/${base.entityId}-${base.fileId}.pdf`);
    expect(
      objectKeyOf({
        ...base,
        kind: 'document',
        entityType: 'document',
        type: 'application/pdf',
        districtCode: '3026',
      }),
    ).toBe(`HUM/WC26/2026/3026/${base.entityId}-${base.fileId}.pdf`);
  });

  it('builds keys of ids and codes only, which the storage accepts', () => {
    for (const kind of ['evidence', 'animal_photo', 'payment_copy', 'document'] as const)
      for (const entityType of ['application', 'animal', 'payment', 'document'])
        expect(() => assertKey(objectKeyOf({ ...base, kind, entityType }))).not.toThrow();
  });
});
