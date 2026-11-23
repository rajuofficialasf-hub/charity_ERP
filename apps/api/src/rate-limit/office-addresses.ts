import { BlockList, isIPv4, isIPv6 } from 'node:net';
import { inZeroIpv6Network } from '@css/shared/settings';
import type { Logger } from 'pino';

/** The IPv6 prefix the limiter counts as one client (`ipKeyGenerator` groups by it). */
const IPV6_CLIENT_PREFIX = 56;
/** How often the list is read again, so a change on another instance reaches this one. */
const REFRESH_MS = 60_000;
const MAPPED_IPV4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/** The address the server sees, an IPv4 one written in its IPv6 form read as IPv4. */
export function plainAddress(ip: string | undefined): string | null {
  if (!ip) return null;
  const address = MAPPED_IPV4.exec(ip)?.[1] ?? ip;
  return isIPv4(address) || isIPv6(address) ? address : null;
}

/**
 * The office addresses an Admin lists in the settings (`security.office_ips`), held in memory so
 * the rate limiter asks without a database read: read at start, after every change and once a
 * minute. Until the first read, and with an empty list, nobody is exempt; a read that fails keeps
 * the list read before. An IPv6 entry covers its /56, the client the limiter counts; one in the
 * /56 of zeros (loopback, an IPv4 address in its IPv6 form) is never taken.
 */
export class OfficeAddresses {
  private list = new BlockList();
  private size = 0;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly read: () => Promise<readonly string[]>,
    private readonly logger: Pick<Logger, 'warn'>,
  ) {}

  /** Reads the list again; a failure is logged and the list in memory stays. */
  async load(): Promise<void> {
    let entries: readonly string[];
    try {
      entries = await this.read();
    } catch (err) {
      this.logger.warn({ err }, 'office addresses not read; the last list stays');
      return;
    }
    const list = new BlockList();
    for (const entry of entries) {
      const slash = entry.indexOf('/');
      const address = slash === -1 ? entry : entry.slice(0, slash);
      const prefix = slash === -1 ? null : Number(entry.slice(slash + 1));
      if (isIPv4(address)) {
        if (prefix === null) list.addAddress(address, 'ipv4');
        else list.addSubnet(address, prefix, 'ipv4');
      } else if (isIPv6(address) && !inZeroIpv6Network(address)) {
        // an entry in the zero /56 would cover every IPv4 client; the setting refuses one, and a
        // row stored some other way is passed over here too
        list.addSubnet(address, IPV6_CLIENT_PREFIX, 'ipv6');
      }
    }
    this.list = list;
    this.size = entries.length;
  }

  /** Reads the list now and again every minute until `stop`. */
  start(): void {
    void this.load();
    this.timer = setInterval(() => void this.load(), REFRESH_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Whether the client address (as `trust proxy` yields it) is one of the office's. */
  matches(ip: string | undefined): boolean {
    if (this.size === 0) return false;
    const address = plainAddress(ip);
    if (!address) return false;
    return this.list.check(address, isIPv4(address) ? 'ipv4' : 'ipv6');
  }
}
