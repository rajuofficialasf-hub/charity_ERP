import type { MessageKey } from '@css/shared/i18n';
import type { Tx } from '../core/prisma.service';
import { bilingualText } from './account-events';
import type { NotificationService } from './service';

/** The name of each export kind in the notice. */
const LIST_NAMES = new Map<string, MessageKey>([
  ['volunteers', 'exports.pdf.title.volunteers'],
  ['beneficiaries', 'exports.pdf.title.beneficiaries'],
  ['applications', 'exports.pdf.title.applications'],
]);

/**
 * The export events (docs/architecture/NOTIFICATIONS.md, exports): the requester alone hears that
 * their file is ready or failed, published in the transaction that ends the job. The notice names
 * the list, never a row of it, and leads to "My exports".
 */
export class ExportEvents {
  constructor(private readonly notifications: NotificationService) {}

  ready(tx: Tx, job: { id: string; kind: string; requestedBy: string }): Promise<unknown> {
    return this.publish(tx, 'export_ready', job);
  }

  failed(tx: Tx, job: { id: string; kind: string; requestedBy: string }): Promise<unknown> {
    return this.publish(tx, 'export_failed', job);
  }

  private publish(
    tx: Tx,
    key: 'export_ready' | 'export_failed',
    job: { id: string; kind: string; requestedBy: string },
  ): Promise<unknown> {
    const name = LIST_NAMES.get(job.kind);
    return this.notifications.publish(tx, {
      key,
      recipients: [{ user: job.requestedBy }],
      params: { ...(name ? { list_name: bilingualText(name) } : {}), jobId: job.id },
      about: job.id,
    });
  }
}
