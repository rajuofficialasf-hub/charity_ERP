import { describe, expect, it } from 'vitest';
import {
  kindAllowedOn,
  maxSizeOf,
  sameFileType,
  UPLOAD_RULES,
  uploadSessionCreateSchema,
} from './index.js';

// The rules of the chunked upload that the API checks and the app shows before it sends.
describe('the upload rules', () => {
  it('links each kind only to its record types', () => {
    expect(kindAllowedOn('application', 'distribution_proof')).toBe(true);
    expect(kindAllowedOn('expense_claim', 'voucher')).toBe(true);
    expect(kindAllowedOn('issue', 'voucher')).toBe(false);
    expect(kindAllowedOn('beneficiary', 'nid_photo')).toBe(false);
    expect(kindAllowedOn('__proto__', 'document')).toBe(false);
  });

  it('allows JPEG, PNG and WebP photos up to 5 MB, PDF vouchers up to 10 MB, documents up to 20 MB', () => {
    expect(maxSizeOf('distribution_proof', 'image/webp')).toBe(5 * 1024 * 1024);
    expect(maxSizeOf('distribution_proof', 'image/heic')).toBeNull();
    expect(maxSizeOf('distribution_proof', 'application/pdf')).toBeNull();
    expect(maxSizeOf('voucher', 'application/pdf')).toBe(10 * 1024 * 1024);
    expect(maxSizeOf('document', 'application/pdf')).toBe(20 * 1024 * 1024);
    expect(maxSizeOf('document', 'image/svg+xml')).toBeNull();
    expect(UPLOAD_RULES.partSize * UPLOAD_RULES.maxParts).toBe(20 * 1024 * 1024);
  });

  it('treats HEIC and HEIF as one family', () => {
    expect(sameFileType('image/heic', 'image/heif')).toBe(true);
    expect(sameFileType('image/jpeg', 'image/png')).toBe(false);
  });

  it('refuses a create with an unknown field, a bad slot or an upper-case SHA-256', () => {
    const create = {
      clientUuid: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
      kind: 'evidence',
      entityType: 'application',
      entityId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c',
      slot: 'evidence',
      mime: 'image/jpeg',
      sizeBytes: 100,
      sha256: 'a'.repeat(64),
      source: 'camera',
    };
    expect(uploadSessionCreateSchema.safeParse(create).success).toBe(true);
    for (const bad of [
      { ...create, name: 'IMG_0001.jpg' },
      { ...create, slot: '../x' },
      { ...create, sha256: 'A'.repeat(64) },
      { ...create, sizeBytes: 20 * 1024 * 1024 + 1 },
    ])
      expect(uploadSessionCreateSchema.safeParse(bad).success).toBe(false);
  });
});
