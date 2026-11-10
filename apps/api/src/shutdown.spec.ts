import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createShutdown, type ShutdownSteps } from './shutdown';

const GRACE = 35_000;

function steps(overrides: Partial<ShutdownSteps> = {}) {
  const order: string[] = [];
  const exit = vi.fn((code: number) => {
    order.push(`exit ${code}`);
  });
  const all: ShutdownSteps = {
    closeServer: async () => {
      order.push('close server');
    },
    closeResources: async () => {
      order.push('close resources');
    },
    graceMs: GRACE,
    exit,
    log: { info: vi.fn(), error: vi.fn() },
    ...overrides,
  };
  return { all, order, exit };
}

describe('the shutdown of a process', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('closes the server, then the resources, then exits 0', async () => {
    const { all, order } = steps();
    createShutdown(all)('SIGTERM');
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['close server', 'close resources', 'exit 0']);
  });

  it('does nothing on a second signal', async () => {
    const { all, order } = steps();
    const shutdown = createShutdown(all);
    shutdown('SIGTERM');
    shutdown('SIGINT');
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['close server', 'close resources', 'exit 0']);
  });

  it('exits 1 at the grace period when closing hangs', async () => {
    const { all, exit } = steps({ closeServer: () => new Promise(() => {}) });
    createShutdown(all)('SIGTERM');
    await vi.advanceTimersByTimeAsync(GRACE - 1);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('still closes the resources when the server fails to close, and exits 1', async () => {
    const { all, order } = steps({
      closeServer: async () => {
        order.push('close server');
        throw new Error('not running');
      },
    });
    createShutdown(all)('SIGTERM');
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['close server', 'close resources', 'exit 1']);
  });

  it('exits 1 when closing the resources fails', async () => {
    const { all, exit } = steps({
      closeResources: async () => {
        throw new Error('pool busy');
      },
    });
    createShutdown(all)('SIGTERM');
    await vi.advanceTimersByTimeAsync(0);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('makes readiness fail before anything else, so the proxy stops sending new requests', async () => {
    const { all, order } = steps({ markUnready: () => order.push('readiness fails') });
    createShutdown(all)('SIGTERM');
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['readiness fails', 'close server', 'close resources', 'exit 0']);
  });

  it('keeps serving for the delay before it stops accepting connections', async () => {
    const { all, order } = steps({
      markUnready: () => order.push('readiness fails'),
      delayMs: 5_000,
    });
    createShutdown(all)('SIGTERM');
    await vi.advanceTimersByTimeAsync(4_999);
    expect(order).toEqual(['readiness fails']);
    await vi.advanceTimersByTimeAsync(1);
    expect(order).toEqual(['readiness fails', 'close server', 'close resources', 'exit 0']);
  });

  it('closes only the resources in a process without a server, as the worker', async () => {
    const { all, order } = steps({ closeServer: undefined });
    createShutdown(all)('SIGTERM');
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['close resources', 'exit 0']);
  });
});
