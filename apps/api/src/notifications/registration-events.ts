import type { Logger } from 'pino';

/**
 * Registration, approval, correction, edit-request, blocklist and handover events (plan
 * docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, R16). T1.9 only calls the
 * hook; the notification task T1.14 plugs delivery in. Events carry ids, never personal data.
 */
export type RegistrationEventType =
  | 'registration.started'
  | 'registration.verified'
  | 'registration.reference_lookup'
  | 'registration.submitted'
  | 'registration.approved'
  | 'registration.rejected'
  | 'registration.correction_requested'
  | 'registration.resubmitted'
  | 'registration.edit_requested'
  | 'registration.edit_decided';

export interface RegistrationEvent {
  type: RegistrationEventType;
  draftId?: string;
  userId?: string;
}

export interface RegistrationEvents {
  emit(event: RegistrationEvent): void;
}

/** Until T1.14: one log line per event. */
export class LoggingRegistrationEvents implements RegistrationEvents {
  constructor(private readonly logger: Logger) {}

  emit(event: RegistrationEvent): void {
    this.logger.info(
      { event: event.type, draftId: event.draftId, userId: event.userId },
      'registration event',
    );
  }
}
