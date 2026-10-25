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
}

/**
 * The built effects of the catalogue (docs/architecture/WORKFLOW_ENGINE.md, "Effect catalogue"),
 * read from a transition's list into one outcome the engine applies: the audit entry, the
 * notifications, the lock. The score, quota and ledger effects record nothing until their modules
 * exist, and say so in the audit entry rather than passing silently.
 */
export function readEffects(effects: readonly string[], events: ApplicationEvents): EffectOutcome {
  const out: EffectOutcome = { auditAction: null, notify: [], locked: false, pending: [] };
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
