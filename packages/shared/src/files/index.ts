import { z } from 'zod';

/**
 * The chunked upload through the API (docs/architecture/FILES_AND_DOCUMENTS.md, "Upload pipeline"
 * and "Validation table"): the part size, the kinds of file, the records each kind may link to and
 * the types and sizes each kind allows. The API checks every upload with them and the PWA shows
 * the same limits before it sends anything.
 */
export const UPLOAD_RULES = {
  /** One part: small enough to resend on a 2G connection. */
  partSize: 262_144,
  /** The most parts of one upload: the largest kind, a 20 MB document. */
  maxParts: 80,
  /** Open sessions one user may hold at a time. */
  openSessions: 20,
  /** A session expires this long after its last part. */
  sessionLifeMs: 60 * 60_000,
  /** A capture this far from the record's creation is flagged as stale. */
  staleCaptureMs: 10 * 60_000,
} as const;

export const FILE_KINDS = [
  'distribution_proof',
  'construction_proof',
  'evidence',
  'voucher',
  'payment_copy',
  'document',
  'animal_photo',
  'profile_photo',
  'nid_photo',
  'media_asset',
  'issue_photo',
] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const FILE_SOURCES = ['camera', 'gallery', 'scan'] as const;
export type FileSource = (typeof FILE_SOURCES)[number];

/** The types the server recognises by their first bytes. */
export const FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
] as const;
export type FileType = (typeof FILE_TYPES)[number];

const MB = 1024 * 1024;
const IMAGES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
const sizes = (types: readonly FileType[], max: number) =>
  Object.fromEntries(types.map((type) => [type, max])) as Partial<Record<FileType, number>>;
const PHOTO = sizes(IMAGES, 5 * MB);

/** The types each kind allows and the largest size of each, before any compression. */
export const KIND_TYPES: Record<FileKind, Partial<Record<FileType, number>>> = {
  distribution_proof: PHOTO,
  construction_proof: PHOTO,
  evidence: PHOTO,
  animal_photo: PHOTO,
  issue_photo: PHOTO,
  profile_photo: PHOTO,
  nid_photo: PHOTO,
  voucher: { ...PHOTO, 'application/pdf': 10 * MB },
  payment_copy: { ...PHOTO, 'application/pdf': 10 * MB },
  document: { 'application/pdf': 20 * MB, 'image/jpeg': 20 * MB, 'image/png': 20 * MB },
  media_asset: sizes(IMAGES, 10 * MB),
};

/**
 * The records a chunked upload may link to, and the kinds each takes. Profile and NID photos keep
 * their own registration upload; beneficiary photos and media assets come with their modules.
 */
export const UPLOAD_RECORD_KINDS = {
  application: ['distribution_proof', 'construction_proof', 'evidence', 'voucher', 'payment_copy'],
  activity: ['distribution_proof', 'construction_proof', 'evidence'],
  issue: ['issue_photo'],
  voucher: ['voucher'],
  expense_claim: ['voucher'],
  payment: ['payment_copy'],
  animal: ['animal_photo'],
  document: ['document'],
} as const satisfies Record<string, readonly FileKind[]>;
export type UploadRecordType = keyof typeof UPLOAD_RECORD_KINDS;
export const UPLOAD_RECORD_TYPES = Object.keys(UPLOAD_RECORD_KINDS) as UploadRecordType[];

/** Whether a kind may link to a record type. */
export function kindAllowedOn(entityType: string, kind: FileKind): boolean {
  if (!Object.hasOwn(UPLOAD_RECORD_KINDS, entityType)) return false;
  const kinds: readonly FileKind[] = UPLOAD_RECORD_KINDS[entityType as UploadRecordType];
  return kinds.includes(kind);
}

/** The largest size a kind allows for a type, or null when the kind does not take the type. */
export function maxSizeOf(kind: FileKind, type: string): number | null {
  const limits = KIND_TYPES[kind];
  return Object.hasOwn(limits, type) ? (limits[type as FileType] ?? null) : null;
}

/** HEIC and HEIF are one container family: a phone may name either. */
export function sameFileType(a: string, b: string): boolean {
  const family = (t: string) => (t === 'image/heif' ? 'image/heic' : t);
  return family(a) === family(b);
}

export const gpsSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).optional(),
});

/** The start of an upload: what the file is, where it links and what the phone measured. */
export const uploadSessionCreateSchema = z.strictObject({
  clientUuid: z.uuid(),
  kind: z.enum(FILE_KINDS),
  entityType: z.string().min(1).max(40),
  entityId: z.uuid(),
  slot: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  mime: z.string().min(1).max(100),
  sizeBytes: z
    .int()
    .min(1)
    .max(UPLOAD_RULES.partSize * UPLOAD_RULES.maxParts),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  capturedAt: z.iso.datetime({ offset: true }).optional(),
  recordCreatedAt: z.iso.datetime({ offset: true }).optional(),
  gps: gpsSchema.optional(),
  source: z.enum(FILE_SOURCES),
});
export type UploadSessionCreate = z.infer<typeof uploadSessionCreateSchema>;
