import type { WorkflowDefinition } from '@css/shared';
import { z } from 'zod';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Tx } from '../core/prisma.service.js';
import { lockPeople, writeHelpCounts } from '../services/help-history.js';

/** The trigger of the common cycle's move that a project's close runs on its applications. */
const PROJECT_CLOSED = 'project.closed';
/** The state whose applications were never delivered when their project closes. */
const STILL_RUNNING = 'implementation';
/** The audit action of an application given back its state at the project's reopen. */
const REOPENED = 'application.reopened';

const notDeliveredOf = (definition: WorkflowDefinition) =>
  z.object({ not_delivered_outcome: z.string() }).safeParse(definition.overrides).data
    ?.not_delivered_outcome ?? null;

/** Who and when, for the rows and the audit entries of one close or reopen. */
export interface ProjectMove {
  projectId: string;
  actor: string;
  now: Date;
}

/**
 * Closes the unfinished applications of a project with its close (docs/architecture/
 * WORKFLOW_ENGINE.md, "Common application cycle"): the automatic move of the project's workflow
 * whose trigger is `project.closed` takes every application in one of its from-states to closed,
 * keeping the state and the outcome it had on the row, and gives the ones still in implementation
 * the template's not-delivered outcome. Each move gets its own audit entry with the template's
 * action; the people whose applications moved are taken first, as every writer of a person's
 * applications does, and their kept count of help is written again after the move. Answers how
 * many applications closed.
 */
export async function closeProjectApplications(
  tx: Tx,
  audit: AuditWriter,
  definition: WorkflowDefinition,
  move: ProjectMove,
): Promise<number> {
  const transition = (definition.transitions ?? []).find(
    (t) => t.auto === true && t.trigger === PROJECT_CLOSED,
  );
  if (!transition) return 0;
  const from = Array.isArray(transition.from) ? transition.from : [transition.from];
  const effects = transition.effects ?? [];
  const action = effects.find((e) => e.startsWith('audit:'))?.slice('audit:'.length);
  const locked = effects.includes('lock:fields');
  // the outcome is set here and the audit written below; the photo and voucher locks belong to
  // modules not built yet, so the entry names them as pending, as the engine does
  const pending = effects.filter(
    (e) => !e.startsWith('audit:') && !e.startsWith('outcome.set') && e !== 'lock:fields',
  );
  const notDelivered = notDeliveredOf(definition);
  const people = await lockPeople(tx, await peopleOf(tx, move.projectId, from));
  // every expression of the SET reads the row as it was before the statement
  const rows = await tx.$queryRaw<
    {
      id: string;
      closed_from_status: string;
      closed_from_outcome: string | null;
      outcome: string | null;
    }[]
  >`
    UPDATE applications
       SET closed_from_status = status,
           closed_from_outcome = outcome,
           outcome = CASE WHEN status = ${STILL_RUNNING} AND ${notDelivered}::text IS NOT NULL
                          THEN ${notDelivered}::text ELSE outcome END,
           status = 'closed',
           updated_by = ${move.actor}::uuid,
           updated_at = ${move.now}
     WHERE project_id = ${move.projectId}::uuid AND status = ANY(${from}::text[])
    RETURNING id, closed_from_status, closed_from_outcome, outcome`;
  for (const row of rows)
    await audit.record(tx, {
      action: action ?? 'application.closed',
      entityType: 'application',
      entityId: row.id,
      old: { status: row.closed_from_status, outcome: row.closed_from_outcome },
      new: {
        status: 'closed',
        outcome: row.outcome,
        automatic: true,
        ...(locked ? { locked: true } : {}),
        ...(pending.length ? { effectsPending: pending } : {}),
      },
      actorUserId: move.actor,
    });
  await writeHelpCounts(tx, people);
  return rows.length;
}

/**
 * Gives the applications a project's close closed their state and outcome back at the project's
 * reopen (the rule `applications.restore_prior_state` of the common cycle), each with its own audit
 * entry, and writes the people's kept count of help again. A closed project's applications cannot
 * move, so each returns to the state it was closed from. Answers how many returned.
 */
export async function reopenProjectApplications(
  tx: Tx,
  audit: AuditWriter,
  move: ProjectMove,
): Promise<number> {
  const people = await lockPeople(tx, await peopleOf(tx, move.projectId, ['closed'], true));
  const rows = await tx.$queryRaw<
    { id: string; status: string; outcome: string | null; closed_outcome: string | null }[]
  >`
    WITH closed AS (
      SELECT id, outcome FROM applications
       WHERE project_id = ${move.projectId}::uuid AND status = 'closed'
         AND closed_from_status IS NOT NULL
       FOR UPDATE
    )
    UPDATE applications a
       SET status = a.closed_from_status,
           outcome = a.closed_from_outcome,
           closed_from_status = NULL,
           closed_from_outcome = NULL,
           updated_by = ${move.actor}::uuid,
           updated_at = ${move.now}
      FROM closed c
     WHERE a.id = c.id
    RETURNING a.id, a.status, a.outcome, c.outcome AS closed_outcome`;
  for (const row of rows)
    await audit.record(tx, {
      action: REOPENED,
      entityType: 'application',
      entityId: row.id,
      old: { status: 'closed', outcome: row.closed_outcome },
      new: { status: row.status, outcome: row.outcome, automatic: true },
      actorUserId: move.actor,
    });
  await writeHelpCounts(tx, people);
  return rows.length;
}

/** The people of a project's applications in these states, before any application row is taken. */
async function peopleOf(
  tx: Tx,
  projectId: string,
  states: readonly string[],
  closedByProject = false,
): Promise<string[]> {
  const rows = await tx.application.findMany({
    where: {
      projectId,
      status: { in: [...states] },
      beneficiaryId: { not: null },
      ...(closedByProject ? { closedFromStatus: { not: null } } : {}),
    },
    select: { beneficiaryId: true },
  });
  return [...new Set(rows.map((r) => r.beneficiaryId!))];
}
