import type { OfficeAddressesSetting } from '@css/shared/settings';
import type { Principal } from '../auth/principal.js';
import { type OfficeAddresses, plainAddress } from '../rate-limit/office-addresses.js';
import type { SettingsService } from './settings.js';

/** The office addresses as the Admin's page reads them (contract `OfficeAddresses`). */
export interface OfficeAddressesView {
  addresses: string[];
  /** When the list last changed; null while it was never set. */
  updatedAt: string | null;
  /** The caller's own address as the server sees it, to add the office the page is opened from. */
  yourAddress: string | null;
}

/**
 * The office addresses an Admin keeps (the setting `security.office_ips`): the write is the
 * settings' own, validated and audited as `settings.change`, and the rate limiter's list in memory
 * is read again at once.
 */
export class OfficeAddressesService {
  constructor(
    private readonly settings: SettingsService,
    private readonly office: OfficeAddresses,
  ) {}

  async view(callerIp: string | undefined): Promise<OfficeAddressesView> {
    const entry = await this.settings.entry('security.office_ips');
    return {
      addresses: (entry.value as OfficeAddressesSetting).addresses,
      updatedAt: entry.updatedAt,
      yourAddress: plainAddress(callerIp),
    };
  }

  async set(
    actor: Principal,
    value: OfficeAddressesSetting,
    callerIp: string | undefined,
  ): Promise<OfficeAddressesView> {
    await this.settings.write(actor, 'security.office_ips', value);
    await this.office.load();
    return this.view(callerIp);
  }
}
