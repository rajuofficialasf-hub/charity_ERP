import type { FileKind, FileType } from '@css/shared/files';
import type { Bucket } from '../storage/index.js';

/** Enough of the start of a file to tell every allowed type. */
export const MAGIC_LENGTH = 16;

const ascii = (bytes: Buffer, from: number, to: number) =>
  bytes.length >= to ? bytes.toString('latin1', from, to) : '';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx']);
const HEIF_BRANDS = new Set(['mif1', 'msf1', 'heif']);

/**
 * The type of a file from its first bytes, never from its name or a header the client sends:
 * JPEG, PNG, WebP, HEIC or HEIF, and PDF. Anything else, an SVG or an HTML page included, is null.
 */
export function detectType(bytes: Buffer): FileType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
  if (ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (HEIC_BRANDS.has(brand)) return 'image/heic';
    if (HEIF_BRANDS.has(brand)) return 'image/heif';
  }
  if (ascii(bytes, 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

const EXTENSION: Record<FileType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

/** The bucket of each kind that a chunked upload takes. */
export function bucketOf(kind: FileKind): Bucket {
  switch (kind) {
    case 'voucher':
    case 'payment_copy':
      return 'vouchers';
    case 'document':
      return 'documents';
    case 'profile_photo':
    case 'nid_photo':
      return 'profiles';
    case 'media_asset':
      return 'media';
    default:
      return 'photos';
  }
}

/** What a storage key is built from: ids and codes of the record, never a name. */
export interface KeyParts {
  fileId: string;
  kind: FileKind;
  type: FileType;
  entityType: string;
  entityId: string;
  projectCode: string;
  programCode: string;
  year: number;
  applicationId: string | null;
  districtCode: string | null;
}

/**
 * The storage key of a new file (docs/architecture/FILES_AND_DOCUMENTS.md, "Storage layout"):
 * documents by program, project, year and district; photos and vouchers under the project and the
 * record. Only ids and codes reach a key, so no person's name, NID or number is ever in a path.
 */
export function objectKeyOf(p: KeyParts): string {
  const file = `${p.fileId}.${EXTENSION[p.type]}`;
  switch (bucketOf(p.kind)) {
    case 'documents':
      return `${p.programCode}/${p.projectCode}/${p.year}/${p.districtCode ?? '_central'}/${p.entityId}-${file}`;
    case 'vouchers':
      return `${p.projectCode}/${voucherFolder(p.entityType)}/${p.entityId}/${file}`;
    default:
      if (p.entityType === 'issue') return `${p.projectCode}/issues/${p.entityId}/${file}`;
      if (p.entityType === 'animal')
        return `${p.projectCode}/animals/${p.entityId}/${p.kind}/${file}`;
      if (p.applicationId) return `${p.projectCode}/${p.applicationId}/${p.kind}/${file}`;
      return `${p.projectCode}/${p.entityType}/${p.entityId}/${p.kind}/${file}`;
  }
}

function voucherFolder(entityType: string): string {
  switch (entityType) {
    case 'application':
      return 'applications';
    case 'expense_claim':
      return 'claims';
    case 'payment':
      return 'payments';
    default:
      return 'vouchers';
  }
}
