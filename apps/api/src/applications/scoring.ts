import { scoreCriteriaSchema, uuidv7 } from '@css/shared';
import { scoreOf } from '@css/shared/forms';
import { isoDateInDhaka } from '@css/shared/format';
import type { Clock } from '../core/clock';
import type { SideEffect, SideEffectRunner } from '../workflow/effects';
import type { Tx } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type { NisabService } from '../services/nisab';
import { readDefinition } from '../services/forms';
import { nisabOption, readAnswers } from './answers';

/**
 * The priority score of an application, kept beside it: the breakdown in `application_scores`
 * and the total on the application, so the office's list pages by score. Computed when the
 * application reaches the office and after every answer change until the decision, then frozen
 * (`snapshot_at`); the score only sorts and recommends, it never decides.
 */
export class ScoringService implements SideEffectRunner {
  constructor(
    private readonly clock: Clock,
    private readonly nisab: NisabService,
  ) {}

  /**
   * Computes and stores the score of an application, unless its score was frozen at a decision;
   * a form without points leaves it without a score. Answers the total, or null.
   */
  async compute(tx: Tx, applicationId: string, actor: string | null): Promise<number | null> {
    const row = await tx.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        formVersionId: true,
        projectId: true,
        beneficiaryId: true,
        totalScore: true,
        project: { select: { programId: true } },
        applicationScoresApplication: { select: { snapshotAt: true } },
      },
    });
    if (!row) return null;
    if (row.applicationScoresApplication?.snapshotAt)
      return row.totalScore === null ? null : Number(row.totalScore);
    const definition = await readDefinition(tx, row.formVersionId, 'official');
    const answers = await readAnswers(tx, row.id, definition);
    const today = isoDateInDhaka(this.clock.now());
    const score = scoreOf(definition, answers, {
      today,
      ...(await nisabOption(this.nisab, today)),
      notPreviouslyAssisted: await this.notPreviouslyAssisted(tx, row),
    });
    const now = this.clock.now();
    if (!score) {
      await tx.applicationScore.deleteMany({ where: { applicationId: row.id } });
      await tx.application.update({ where: { id: row.id }, data: { totalScore: null } });
      return null;
    }
    const criteria = scoreCriteriaSchema.parse({
      scoring_version: row.formVersionId,
      items: score.items,
      total: score.total,
    }) as Prisma.InputJsonValue;
    await tx.applicationScore.upsert({
      where: { applicationId: row.id },
      create: {
        id: uuidv7(),
        applicationId: row.id,
        criteria,
        totalScore: score.total,
        computedAt: now,
        createdBy: actor,
        updatedBy: actor,
      },
      update: {
        criteria,
        totalScore: score.total,
        computedAt: now,
        updatedBy: actor,
        updatedAt: now,
      },
    });
    await tx.application.update({ where: { id: row.id }, data: { totalScore: score.total } });
    return score.total;
  }

  /** The engine's score effects: computed when the application reaches the office, frozen at a decision. */
  async run(tx: Tx, effect: SideEffect, applicationId: string, actor: string): Promise<void> {
    if (effect === 'score.compute') await this.compute(tx, applicationId, actor);
    else await this.snapshot(tx, applicationId);
  }

  /** Freezes the score at a decision, so later changes to the answers or the history leave it. */
  async snapshot(tx: Tx, applicationId: string): Promise<void> {
    await tx.applicationScore.updateMany({
      where: { applicationId, snapshotAt: null },
      data: { snapshotAt: this.clock.now() },
    });
  }

  /** The person has no application approved in another project of the same program. */
  private async notPreviouslyAssisted(
    tx: Tx,
    row: { projectId: string; beneficiaryId: string | null; project: { programId: string } },
  ): Promise<boolean> {
    if (!row.beneficiaryId) return true;
    const earlier = await tx.application.count({
      where: {
        beneficiaryId: row.beneficiaryId,
        projectId: { not: row.projectId },
        project: { programId: row.project.programId },
        approvedAt: { not: null },
        status: { not: 'deleted' },
      },
    });
    return earlier === 0;
  }
}
