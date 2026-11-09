import type { Tx } from '../core/prisma.service';
import type { ApplicationEvents } from '../notifications/application-events';
import { effectKey, BUILT_EFFECTS } from './registry';

/** What a transition's effects write into its audit entry and queue for after the commit. */
export interface EffectOutcome {
  /** The audit action the template names; the engine's default when none does. */
  auditAction: string | null;
  /** The notification keys to publish once the state is written. */
  notify: string[];
  /** The answers are locked from here on (the approved state keeps them read-only). */
  locked: boolean;
  /** Effects the template names whose module is not built yet; the audit entry lists them. */
  pending: string[];
  /** Effects that write inside the move's transaction, in the template's order. */
  run: SideEffect[];
}

/** The effects that write rows of their own when they run. */
export type SideEffect =
  'score.compute' | 'score.snapshot' | 'waitlist.enqueue' | 'waitlist.dequeue';

/** The writers of the side effects, given to the engine by the container. */
export interface SideEffectRunner {
  run(tx: Tx, effect: SideEffect, applicationId: string, actor: string): Promise<void>;
}

/**
 * The built effects of the catalogue (docs/architecture/WORKFLOW_ENGINE.md, "Effect catalogue"),
 * read from a transition's list into one outcome the engine applies: the audit entry, the
 * notifications, the lock, and the side effects that write their own rows (the score). The quota
 * and ledger effects record nothing until their modules exist, and say so in the audit entry
 * rather than passing silently.
 */
export function readEffects(effects: readonly string[], events: ApplicationEvents): EffectOutcome {
  const out: EffectOutcome = {
    auditAction: null,
    notify: [],
    locked: false,
    pending: [],
    run: [],
  };
  for (const name of effects) {
    const key = effectKey(name, BUILT_EFFECTS);
    const parameter = name.includes(':') ? name.slice(name.indexOf(':') + 1) : null;
    switch (key) {
      case 'audit':
        out.auditAction = parameter;
        break;
      case 'notify':
        if (parameter && events.knows(parameter)) out.notify.push(parameter);
        else out.pending.push(name);
        break;
      case 'lock:fields':
        out.locked = true;
        break;
      case 'score.compute':
      case 'score.snapshot':
      case 'waitlist.enqueue':
      case 'waitlist.dequeue':
        out.run.push(key);
        break;
      case 'needs_verification.link':
        // the person is bound or created by the application service's hook on the same move
        break;
      case 'quota.increment':
      case 'ledger.post:approved':
        out.pending.push(name);
        break;
      default:
        // a declared effect of a later module: the engine refuses the transition before this
        out.pending.push(name);
    }
  }
  return out;
}
