import type { WorkflowDefinition } from '@css/shared';
import { describe, expect, it } from 'vitest';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Tx } from '../core/prisma.service.js';
import { closeProjectApplications } from './project-close.js';

// A workflow without the common cycle's project.closed move closes no application, and touches
// neither the database nor the audit log.
describe('closing the applications of a project', () => {
  it('closes nothing, and reads and writes nothing, when the workflow has no project.closed move', async () => {
    const untouched = new Proxy(
      {},
      {
        get: (_target, name) => {
          throw new Error(`the database was used: ${String(name)}`);
        },
      },
    ) as Tx;
    const audit = { record: () => Promise.reject(new Error('audited')) } as unknown as AuditWriter;
    const definition = {
      transitions: [{ from: 'submitted', to: 'under_review', permission: 'application.review' }],
    } as unknown as WorkflowDefinition;
    await expect(
      closeProjectApplications(untouched, audit, definition, {
        projectId: '01900000-0000-7000-8000-000000000001',
        actor: '01900000-0000-7000-8000-000000000002',
        now: new Date('2026-11-17T00:00:00Z'),
      }),
    ).resolves.toBe(0);
  });
});
