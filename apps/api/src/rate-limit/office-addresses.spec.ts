import { describe, expect, it, vi } from 'vitest';
import { OfficeAddresses } from './office-addresses.js';

const silent = { warn: vi.fn() } as never;
const officeOf = async (addresses: string[]) => {
  const office = new OfficeAddresses(async () => addresses, silent);
  await office.load();
  return office;
};

describe('the office addresses', () => {
  it('matches a listed address and the addresses of a listed range, nothing else', async () => {
    const office = await officeOf(['203.0.113.5', '198.51.100.0/24']);
    expect(office.matches('203.0.113.5')).toBe(true);
    expect(office.matches('203.0.113.6')).toBe(false);
    expect(office.matches('198.51.100.200')).toBe(true);
    expect(office.matches('198.51.101.1')).toBe(false);
    expect(office.matches(undefined)).toBe(false);
    expect(office.matches('not an address')).toBe(false);
  });

  it('reads an IPv4 address the server sees in its IPv6 form as the IPv4 one', async () => {
    const office = await officeOf(['127.0.0.1']);
    expect(office.matches('::ffff:127.0.0.1')).toBe(true);
    expect(office.matches('::ffff:127.0.0.2')).toBe(false);
  });

  it('takes an IPv6 entry as its /56, the client the limiter counts', async () => {
    const office = await officeOf(['2001:db8:0:1ff::1']);
    expect(office.matches('2001:db8:0:1aa::9')).toBe(true);
    expect(office.matches('2001:db8:0:200::1')).toBe(false);
  });

  it('never lets an entry in the zero IPv6 network reach the IPv4 clients', async () => {
    const office = await officeOf(['::1', '::ffff:203.0.113.5']);
    expect(office.matches('8.8.8.8')).toBe(false);
    expect(office.matches('::ffff:8.8.8.8')).toBe(false);
    expect(office.matches('203.0.113.5')).toBe(false);
  });

  it('matches nothing before the list is read, and keeps the last list when a read fails', async () => {
    let addresses: string[] | null = ['203.0.113.5'];
    const read = async () => {
      if (!addresses) throw new Error('database away');
      return addresses;
    };
    const warn = vi.fn();
    const office = new OfficeAddresses(read, { warn } as never);
    expect(office.matches('203.0.113.5')).toBe(false);
    await office.load();
    expect(office.matches('203.0.113.5')).toBe(true);
    addresses = null;
    await office.load();
    expect(office.matches('203.0.113.5')).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
    // an emptied list exempts nobody
    addresses = [];
    await office.load();
    expect(office.matches('203.0.113.5')).toBe(false);
  });
});
