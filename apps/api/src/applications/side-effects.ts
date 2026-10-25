import type { Clock } from '../core/clock';
import type { Tx } from '../core/prisma.service';
import type { SideEffect, SideEffectRunner } from '../workflow/effects';
import type { ScoringService } from './scoring';

/**
 * The effects of a move that write rows of their own, run inside the move's transaction: the
 * score (computed, or frozen at a decision) and the waitlist's time, which orders the pull among
 * applications of the same score.
 */
export class WorkflowSideEffects implements SideEffectRunner {
  constructor(
    private readonly scoring: ScoringService,
    private readonly clock: Clock,
  ) {}

  async run(tx: Tx, effect: SideEffect, applicationId: string, actor: string): Promise<void> {
    switch (effect) {
      case 'score.compute':
      case 'score.snapshot':
        await this.scoring.run(tx, effect, applicationId, actor);
        return;
      case 'waitlist.enqueue':
        await tx.application.update({
          where: { id: applicationId },
          data: { waitlistedAt: this.clock.now() },
        });
        return;
      case 'waitlist.dequeue':
        await tx.application.update({ where: { id: applicationId }, data: { waitlistedAt: null } });
        return;
    }
  }
}
