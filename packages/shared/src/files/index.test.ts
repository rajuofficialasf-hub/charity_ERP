import { describe, expect, it } from 'vitest';
import {
  COVER_RECORD_TYPES,
  coverSetSchema,
  isCoverRecord,
  kindAllowedOn,
  maxSizeOf,
  officialOnlyKind,
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

  it('takes a cover photo of 5 MB as JPEG, PNG or WebP, on a program or a project series only, from an official', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp'])
      expect(maxSizeOf('cover_photo', type)).toBe(5 * 1024 * 1024);
    for (const type of ['application/pdf', 'image/heic', 'image/svg+xml'])
      expect(maxSizeOf('cover_photo', type)).toBeNull();
    expect(COVER_RECORD_TYPES).toEqual(['program', 'project_series']);
    for (const record of COVER_RECORD_TYPES) {
      expect(kindAllowedOn(record, 'cover_photo')).toBe(true);
      expect(kindAllowedOn(record, 'evidence')).toBe(false);
      expect(isCoverRecord(record)).toBe(true);
    }
    expect(kindAllowedOn('application', 'cover_photo')).toBe(false);
    expect(isCoverRecord('application')).toBe(false);
    expect(officialOnlyKind('cover_photo')).toBe(true);
    expect(
      coverSetSchema.safeParse({ fileId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b' }).success,
    ).toBe(true);
    for (const bad of [
      {},
      { fileId: 'x' },
      { fileId: null },
      { fileId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b', slot: 'cover' },
    ])
      expect(coverSetSchema.safeParse(bad).success).toBe(false);
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
