import { UPLOAD_RULES, type FileKind, type FileSource } from '@css/shared/files';
import { isTransientStatus } from '@css/shared/sync';
import { api, ApiFailure } from '../api/client';
import { type UploadedFile, uploadedFileSchema, type UploadSession } from '../api/schemas';

export type { UploadedFile, UploadSession };

/** What an upload declares: the record it links to and what the phone measured. */
export interface UploadTarget {
  kind: FileKind;
  entityType: string;
  entityId: string;
  slot: string;
  source: FileSource;
  recordCreatedAt?: string;
  capturedAt?: string;
  gps?: { lat: number; lng: number; accuracyM?: number };
}

/**
 * A request that did not arrive (the start or a part) is sent again after these pauses, or after the server's
 * `Retry-After`; then the upload stops as failed and the person may try again, which resumes from
 * the parts the server holds. (Uploads that wait for a connection belong to the offline queue,
 * which follows the long schedule of docs/architecture/OFFLINE_SYNC.md.)
 */
export const PART_RETRY_DELAYS_MS = [1_000, 5_000, 30_000];

/** A failure worth sending again: the network, a timeout, a busy or failing server. */
function isTransient(error: unknown): boolean {
  if (!(error instanceof ApiFailure)) return true;
  return isTransientStatus(error.status);
}

/** The SHA-256 of the bytes, in lower-case hex, as the server compares it. */
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface UploadOptions {
  /** The device's id for this upload: the same id after a reload resumes the same session. */
  clientUuid: string;
  /** 0 to 100 as the parts arrive at the server. */
  onProgress?: (percent: number) => void;
  /** A pause, replaced in tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Stops the upload between two requests (the file was taken off the field). */
  signal?: AbortSignal;
}

/** The upload was stopped through its signal. */
export class UploadStopped extends Error {
  constructor() {
    super('upload stopped');
    this.name = 'UploadStopped';
  }
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Sends one file to the API in 256 KB parts (docs/architecture/FILES_AND_DOCUMENTS.md, "Upload
 * pipeline"): starts the session, or gets the one the same client id started before (a reload),
 * sends only the parts the server does not hold, each retried on a transient failure, and
 * finalizes. A refusal (a wrong type, a duplicate, a record out of reach) is thrown as it came.
 */
export async function uploadFile(
  blob: Blob,
  target: UploadTarget,
  options: UploadOptions,
): Promise<UploadedFile> {
  const sleep = options.sleep ?? wait;
  const progress = (bytes: number) =>
    options.onProgress?.(blob.size ? Math.min(100, Math.round((bytes / blob.size) * 100)) : 100);
  const stopIfAsked = () => {
    if (options.signal?.aborted) throw new UploadStopped();
  };
  const sha256 = await sha256Hex(blob);
  stopIfAsked();
  // a refused or lost create is sent again like a part: the client id makes it the same session
  const session = await withRetries(sleep, () =>
    api<UploadSession>('/upload-sessions', {
      method: 'POST',
      body: {
        clientUuid: options.clientUuid,
        kind: target.kind,
        entityType: target.entityType,
        entityId: target.entityId,
        slot: target.slot,
        mime: blob.type,
        sizeBytes: blob.size,
        sha256,
        source: target.source,
        ...(target.capturedAt ? { capturedAt: target.capturedAt } : {}),
        ...(target.recordCreatedAt ? { recordCreatedAt: target.recordCreatedAt } : {}),
        ...(target.gps ? { gps: target.gps } : {}),
      },
    }),
  );
  const finalize = () =>
    api<UploadedFile>(`/upload-sessions/${session.id}/finalize`, { method: 'POST' });
  if (session.fileId) return finalize();
  const held = new Set(session.partsReceived);
  let sent = session.bytesReceived;
  progress(sent);
  for (let part = 1; part <= session.partCount; part += 1) {
    if (held.has(part)) continue;
    stopIfAsked();
    const bytes = blob.slice(
      (part - 1) * UPLOAD_RULES.partSize,
      Math.min(part * UPLOAD_RULES.partSize, blob.size),
    );
    const body = await bytes.arrayBuffer();
    await withRetries(sleep, () =>
      api<UploadSession>(`/upload-sessions/${session.id}/parts/${part}`, {
        method: 'PUT',
        rawBody: body,
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
    );
    sent += bytes.size;
    progress(sent);
  }
  stopIfAsked();
  return finalize();
}

/** One request, sent again after the pauses on a transient failure. */
async function withRetries<T>(
  sleep: (ms: number) => Promise<void>,
  request: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      const delay = PART_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !isTransient(error)) throw error;
      const asked = error instanceof ApiFailure ? error.retryAfter : undefined;
      await sleep(asked ? asked * 1000 : delay);
    }
  }
}

/** How long a caller waits for the server's scan of a file it just stored, and how often it looks. */
const SCAN_WAIT_MS = 30_000;
const SCAN_POLL_MS = 1_000;

/** The scan state a file's read answers, parsed at the boundary. */
const scanStateSchema = uploadedFileSchema.pick({ virusScan: true });

/** The scan of a stored file did not clear it: refused for good, or not done within the wait. */
export class ScanNotCleared extends Error {
  constructor(readonly state: UploadedFile['virusScan']) {
    super(`file.scan_${state}`);
    this.name = 'ScanNotCleared';
  }
}

/**
 * Waits until the server's scan of a file just stored has cleared it, reading the file's state
 * every second, for a step that may take only a cleared file (a cover); throws `ScanNotCleared`
 * when the scan refused the file or did not end within `SCAN_WAIT_MS`.
 */
export async function waitForScan(
  stored: Pick<UploadedFile, 'id' | 'virusScan'>,
  waitMs = SCAN_WAIT_MS,
): Promise<void> {
  const until = Date.now() + waitMs;
  let state = stored.virusScan;
  for (;;) {
    if (state === 'clean' || state === 'skipped') return;
    if (state === 'infected' || state === 'failed' || Date.now() >= until)
      throw new ScanNotCleared(state);
    await new Promise((resolve) => setTimeout(resolve, SCAN_POLL_MS));
    state = scanStateSchema.parse(await api<unknown>(`/files/${stored.id}`)).virusScan;
  }
}
