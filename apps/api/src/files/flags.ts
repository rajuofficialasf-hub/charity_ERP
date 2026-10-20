import { UPLOAD_RULES } from '@css/shared/files';
import { photoSource } from '@css/shared';
import { z } from 'zod';
import type { Tx } from '../core/prisma.service';

/** The data-quality flags of a photo; they are shown to officials and never block anything. */
export type PhotoFlag =
  | 'no_capture_time'
  | 'no_gps'
  | 'stale_capture'
  | 'gallery_under_camera_only'
  | 'duplicate_suspect';

export interface PhotoFacts {
  kind: string;
  mime: string;
  capturedAt: Date | null;
  hasPosition: boolean;
  /** When the record the photo belongs to was made. */
  recordCreatedAt: Date | null;
  /** When the server received the photo; a capture later than that is impossible. */
  receivedAt: Date;
  source: string;
  /** The project's photo source for the kind: camera only, or camera or gallery. */
  projectSource: 'camera_only' | 'camera_or_gallery' | null;
}

/**
 * The flags the facts decide (docs/architecture/FILES_AND_DOCUMENTS.md, "Image handling" and
 * "Photo source per project"): no capture time, no position, a capture more than ten minutes from
 * the record's creation or after the server received the photo, and a gallery photo where the
 * project asks for the camera. Documents and PDF files carry none.
 */
export function photoFlags(f: PhotoFacts): PhotoFlag[] {
  if (!f.mime.startsWith('image/') || f.kind === 'document') return [];
  const flags: PhotoFlag[] = [];
  if (!f.capturedAt) flags.push('no_capture_time');
  if (!f.hasPosition) flags.push('no_gps');
  const limit = UPLOAD_RULES.staleCaptureMs;
  if (
    f.capturedAt &&
    ((f.recordCreatedAt &&
      Math.abs(f.capturedAt.getTime() - f.recordCreatedAt.getTime()) > limit) ||
      f.capturedAt.getTime() - f.receivedAt.getTime() > limit)
  )
    flags.push('stale_capture');
  if (f.source === 'gallery' && f.projectSource === 'camera_only')
    flags.push('gallery_under_camera_only');
  return flags;
}

/** The proof photos ask for the camera unless the project allows the gallery; vouchers allow it. */
const DEFAULT_SOURCE = new Map<string, 'camera_only' | 'camera_or_gallery'>([
  ['distribution_proof', 'camera_only'],
  ['construction_proof', 'camera_only'],
  ['evidence', 'camera_only'],
  ['voucher', 'camera_or_gallery'],
  ['payment_copy', 'camera_or_gallery'],
]);

/** The photo sources of the distribution row's settings; its other settings are not read here. */
const PHOTO_SOURCES = z.object({ source: z.record(z.string(), z.unknown()).optional() });

/**
 * The project's photo source for a kind, from the photo-rule settings kept on the project's
 * `distribution` component row; null for a kind the setting does not cover.
 */
export async function projectPhotoSource(
  db: Tx,
  projectId: string,
  kind: string,
): Promise<'camera_only' | 'camera_or_gallery' | null> {
  const fallback = DEFAULT_SOURCE.get(kind);
  if (!fallback) return null;
  const row = await db.projectComponent.findUnique({
    where: { projectId_componentKey: { projectId, componentKey: 'distribution' } },
    select: { settings: true },
  });
  const settings = PHOTO_SOURCES.safeParse(row?.settings);
  const chosen = settings.success
    ? new Map(Object.entries(settings.data.source ?? {})).get(kind)
    : undefined;
  const parsed = photoSource.safeParse(chosen);
  return parsed.success ? parsed.data : fallback;
}
