import { describe, expect, it } from 'vitest';
import { composeEmail, escapeHtml, GIVE_UP_MS, retryDelay, safeError, Throttle } from './delivery';

/** A clock that moves only when the throttle sleeps. */
function fakeTime() {
  let t = 1_000_000;
  const waits: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      waits.push(ms);
      t += ms;
    },
    waits,
  };
}

// The pure parts of the delivery: the retry schedule, the stored error, the throttle and the
// composed email (docs/architecture/NOTIFICATIONS.md, delivery and outbox).
describe('the delivery rules', () => {
  it('waits 30 s, 2 min, 10 min, 1 h, then hourly, and gives up after 24 hours', () => {
    expect([1, 2, 3, 4, 5, 20].map(retryDelay)).toEqual([
      30_000, 120_000, 600_000, 3_600_000, 3_600_000, 3_600_000,
    ]);
    expect(GIVE_UP_MS).toBe(24 * 3_600_000);
  });

  it('stores an error without an address or a phone number, on one bounded line', () => {
    const stored = safeError('550 5.1.1 <rahim.uddin@example.org>: unknown user\r\nat 01712345678');
    expect(stored).not.toContain('rahim.uddin');
    expect(stored).not.toContain('01712345678');
    expect(stored).toContain('[address]');
    expect(stored).not.toMatch(/[\r\n]/);
    expect(safeError('x'.repeat(1000))).toHaveLength(300);
  });

  it('escapes every HTML special character', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('keeps the set gap between two sends', async () => {
    const time = fakeTime();
    const throttle = new Throttle(2_000, time.now, time.sleep);
    await throttle.wait();
    await throttle.wait();
    await throttle.wait();
    expect(time.waits).toEqual([2_000, 2_000]);
  });
});

describe('composeEmail', () => {
  const template = {
    subject: 'New: {{name}}',
    body: 'Hello,\n{{name}} sent {{count}} items.',
    variables: ['name', 'count'],
  };

  it('escapes the values in the HTML part and keeps the text part as rendered', () => {
    const message = composeEmail(
      'sample',
      template,
      'en',
      { name: '<script>alert(1)</script>', count: 2 },
      'official@example.org',
    );
    expect(message.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('Hello,<br>');
    expect(message.text).toBe('Hello,\n<script>alert(1)</script> sent 2 items.');
  });

  it('never lets a newline reach the subject', () => {
    const message = composeEmail(
      'sample',
      template,
      'en',
      { name: 'Rahim\r\nBcc: other@example.org', count: 1 },
      'official@example.org',
    );
    expect(message.subject).toBe('New: Rahim Bcc: other@example.org');
    expect(message.subject).not.toMatch(/[\r\n]/);
  });

  it('fails closed on a value it cannot show', () => {
    expect(() =>
      composeEmail('sample', template, 'bn', { name: 'x' }, 'official@example.org'),
    ).toThrow(/count/);
  });
});
