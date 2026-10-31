import { describe, expect, it } from 'vitest';
import { BATCH_MAX_RECORDS } from './constants';
import {
  isPendingPhoto,
  pendingPhotoAnswer,
  rowResultSchema,
  syncBatchRequestSchema,
  syncRecordSchema,
} from './records';

const UUID = '019a2c3e-7b1d-7c2a-9b1e-2d3f4a5b6c7d';
const base = {
  clientUuid: UUID,
  kind: 'application_draft',
  projectId: UUID,
  formVersionId: UUID,
  payload: { answers: [] },
  clientCreatedAt: '2026-10-31T06:00:00.000Z',
  clientUpdatedAt: '2026-10-31T06:00:00.000Z',
};

describe('a sync record', () => {
  it('takes the four kinds of this task and refuses an unknown one', () => {
    for (const kind of [
      'application_draft',
      'application_update',
      'application_submit',
      'field_update',
    ])
      expect(syncRecordSchema.safeParse({ ...base, kind }).success, kind).toBe(true);
    expect(syncRecordSchema.safeParse({ ...base, kind: 'activity' }).success).toBe(false);
  });

  it('needs a uuid, a kind, a project, a form version and the device times', () => {
    expect(syncRecordSchema.safeParse({ ...base, clientUuid: 'not-a-uuid' }).success).toBe(false);
    expect(syncRecordSchema.safeParse({ ...base, clientCreatedAt: 'yesterday' }).success).toBe(
      false,
    );
    const { formVersionId: _dropped, ...withoutVersion } = base;
    expect(syncRecordSchema.safeParse(withoutVersion).success).toBe(false);
  });

  it('may name its target, its base version and the records it depends on', () => {
    const parsed = syncRecordSchema.parse({
      ...base,
      kind: 'application_update',
      target: UUID,
      baseVersion: '"3"',
      dependencies: [UUID],
    });
    expect(parsed.target).toBe(UUID);
    expect(parsed.dependencies).toEqual([UUID]);
  });

  it('refuses unknown fields', () => {
    expect(syncRecordSchema.safeParse({ ...base, owner: UUID }).success).toBe(false);
  });
});

describe('a batch', () => {
  it('holds one to fifty records and the device time', () => {
    const one = syncBatchRequestSchema.safeParse({
      deviceTime: base.clientCreatedAt,
      records: [base],
    });
    expect(one.success).toBe(true);
    const none = syncBatchRequestSchema.safeParse({
      deviceTime: base.clientCreatedAt,
      records: [],
    });
    expect(none.success).toBe(false);
    const many = syncBatchRequestSchema.safeParse({
      deviceTime: base.clientCreatedAt,
      records: Array.from({ length: BATCH_MAX_RECORDS + 1 }, () => base),
    });
    expect(many.success).toBe(false);
  });

  it('may say how many records stay on the device after it', () => {
    const parsed = syncBatchRequestSchema.parse({
      deviceTime: base.clientCreatedAt,
      records: [base],
      pendingAfter: 4,
    });
    expect(parsed.pendingAfter).toBe(4);
    expect(
      syncBatchRequestSchema.safeParse({
        deviceTime: base.clientCreatedAt,
        records: [base],
        pendingAfter: -1,
      }).success,
    ).toBe(false);
  });
});

describe('a row result', () => {
  it('names the record, the outcome and, when there is one, the server id, code and conflict', () => {
    const parsed = rowResultSchema.parse({
      clientUuid: UUID,
      result: 'failed',
      code: 'locked_on_server',
      serverId: UUID,
      conflict: { kept: 'server', serverValue: '01700000000' },
    });
    expect(parsed.conflict?.kept).toBe('server');
    expect(rowResultSchema.safeParse({ clientUuid: UUID, result: 'done' }).success).toBe(false);
  });
});

describe('a photo that waits on the phone', () => {
  it('is a marked answer the server recognises', () => {
    const answer = pendingPhotoAnswer('house_photo', 0);
    expect(isPendingPhoto(answer.value)).toBe(true);
    expect(isPendingPhoto('file-id')).toBe(false);
    expect(isPendingPhoto({ pendingPhoto: false })).toBe(false);
  });
});
