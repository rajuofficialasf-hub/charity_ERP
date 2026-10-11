import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { HEARTBEAT_CRON, HEARTBEAT_QUEUE, startInlineConsumers } from './consumers';
import type { JobRunner } from './job-runner';

function fakeRunner(failWith?: Error) {
  const work = vi.fn(async () => {
    if (failWith) throw failWith;
  });
  const schedule = vi.fn(async () => undefined);
  return { runner: { work, schedule } as unknown as JobRunner, work, schedule };
}

const dev = { JOBS_INLINE: true, NODE_ENV: 'development' as const };
const quiet = pino({ level: 'silent' });

describe('startInlineConsumers (ADR-004)', () => {
  it('registers the consumers and the heartbeat schedule when JOBS_INLINE is set', async () => {
    const { runner, work, schedule } = fakeRunner();
    expect(await startInlineConsumers(dev, runner, quiet)).toBe(true);
    expect(work).toHaveBeenCalledWith(HEARTBEAT_QUEUE, expect.any(Function));
    expect(schedule).toHaveBeenCalledWith(HEARTBEAT_QUEUE, HEARTBEAT_CRON, { kind: 'heartbeat' });
  });

  it('does nothing without JOBS_INLINE or under NODE_ENV=test', async () => {
    const { runner, work } = fakeRunner();
    expect(await startInlineConsumers({ ...dev, JOBS_INLINE: false }, runner, quiet)).toBe(false);
    expect(await startInlineConsumers({ ...dev, NODE_ENV: 'test' }, runner, quiet)).toBe(false);
    expect(work).not.toHaveBeenCalled();
  });

  it('logs and returns false when the registration fails, instead of stopping the api', async () => {
    const lines: string[] = [];
    const logger = pino({ level: 'error' }, { write: (line: string) => void lines.push(line) });
    const { runner } = fakeRunner(new Error('pg-boss is not installed'));
    expect(await startInlineConsumers(dev, runner, logger)).toBe(false);
    expect(lines.join('')).toContain('inline job consumers failed to start');
  });
});
