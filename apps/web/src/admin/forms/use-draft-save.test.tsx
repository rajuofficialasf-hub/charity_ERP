import type { FormDefinition } from '@css/shared/forms';
import { act, fireEvent, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, ME, refreshAs, renderApp } from '../../../test/auth';
import { field, section, T } from '../../../test/forms';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { RETRY_AFTER_MAX_SECONDS } from '@css/shared/sync';
import { useAuth } from '../../lib/auth';
import type { FormVersion } from './forms-api';
import {
  LEAVE_ASK_AFTER_MS,
  SAVE_DELAY_MS,
  SAVE_RETRY_DELAYS_MS,
  SAVE_RETRY_EVERY_MS,
  SAVE_TIMEOUT_MS,
  detailsOf,
  type SaveState,
  useDraftSave,
} from './use-draft-save';

// The draft's own save: sent a while after a change, sent again by itself when it fails on the
// way, never again when the server refuses the draft, and sent before the page is left.
const VERSION_ID = '01900000-0000-7000-8000-0000000000a1';
const draftOf = (text: string): FormDefinition => ({
  sections: [section('extra', [field('q_note', 'short_text', { label: T(text) })])],
});
const VERSION: FormVersion = {
  id: VERSION_ID,
  formId: '01900000-0000-7000-8000-0000000000a2',
  versionNo: 1,
  status: 'draft',
  publishedAt: null,
  sections: draftOf('').sections,
};

/** The saves that reached the server: the text of the draft's question, and where the page was. */
let saves: { text: string; ifMatch: string | null; left: boolean }[];
let staleCalls: number;
let states: SaveState[];
/** While set, the server keeps each save waiting until the test lets it answer. */
let holding: boolean;
let held: (() => void)[];
const release = () => held.shift()!();
/** What the page's own code throws once a save went through, when the test sets one. */
let afterSave: Error | null;

/** The server answers each save with the next of these; the last one repeats. */
function api(...answers: (() => Response | Promise<Response>)[]) {
  saves = [];
  let etagNo = 1;
  server.use(
    http.patch('*/api/v1/form-versions/:id', async ({ request }) => {
      const body = (await request.json()) as FormDefinition;
      const answer = answers[Math.min(saves.length, answers.length - 1)]!;
      saves.push({
        text: body.sections[0]!.fields[0]!.label.bn,
        ifMatch: request.headers.get('if-match'),
        left: screen.queryByTestId('location') !== null,
      });
      if (holding) await new Promise<void>((resolve) => held.push(resolve));
      const response = await answer();
      if (response.status !== 200) return response;
      etagNo += 1;
      return HttpResponse.json(
        {
          data: { ...VERSION, sections: body.sections },
          meta: { requestId: 'r', etag: `"v${etagNo}"` },
        },
        { headers: { ETag: `"v${etagNo}"` } },
      );
    }),
  );
}
const ok = () => HttpResponse.json({});
const down = () => apiError(500, 'server.internal', 'কিছু একটা সমস্যা হয়েছে।');
const cut = () => HttpResponse.error();
/** A connection that hangs: the server never answers. */
const never = () => new Promise<Response>(() => undefined);
/** A busy server that says how many seconds to wait. */
const busy = (after: string) => () =>
  HttpResponse.json(
    {
      error: { code: 'rate_limit.exceeded', message: 'একটু পরে আবার চেষ্টা করুন।', requestId: 'r' },
    },
    { status: 429, headers: { 'Retry-After': after } },
  );
const refusedDraft = () =>
  HttpResponse.json(
    {
      error: {
        code: 'validation.failed',
        messageKey: 'errors.validation.failed',
        message: 'কিছু তথ্য সঠিক নয়।',
        details: [
          { path: 'q_note', code: 'form.unknown_reference', message: 'ঘরটি ফর্মে নেই।' },
          { path: 'q_note', code: 'form.pipe_order', message: 'পরের প্রশ্নের উত্তর বসানো হয়েছে।' },
          { path: 'q_note', code: 'form.unknown_reference', message: 'ঘরটি ফর্মে নেই।' },
        ],
        requestId: 'r',
      },
    },
    { status: 422 },
  );

/** A page that holds a draft: each press of "change" writes the next text and asks for a save. */
function Harness() {
  const { me } = useAuth();
  const [etag, setEtag] = useState('"v1"');
  const [count, setCount] = useState(0);
  const save = useDraftSave({
    version: VERSION,
    etag,
    onSaved: (_saved, next) => {
      if (afterSave) throw afterSave;
      setEtag(next);
    },
    onStale: () => {
      staleCalls += 1;
    },
  });
  useEffect(() => {
    states.push(save.state);
  }, [save.state]);
  if (!me) return null;
  return (
    <>
      <output data-testid="state">{save.state}</output>
      <output data-testid="failure">{save.failure?.kind ?? ''}</output>
      <output data-testid="message">{save.failure?.message ?? ''}</output>
      <output data-testid="errors">{JSON.stringify(detailsOf(save.details))}</output>
      <output data-testid="flags">
        {[
          save.refused && 'refused',
          save.stale && 'stale',
          save.leave.asking && 'asking',
          save.leave.saving && 'slow',
        ]
          .filter(Boolean)
          .join(' ')}
      </output>
      <button
        type="button"
        onClick={() => {
          setCount(count + 1);
          save.schedule(draftOf(`বদল ${count + 1}`));
        }}
      >
        change
      </button>
      <button type="button" onClick={save.retry}>
        retry
      </button>
      <button type="button" onClick={save.leave.stay}>
        stay
      </button>
      <button type="button" onClick={save.leave.go}>
        go
      </button>
    </>
  );
}

const text = (id: string) => screen.getByTestId(id).textContent;
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
/** Lets the network and the screen settle; the clock of the waits does not move. */
const settle = async (turns = 30) => {
  for (let i = 0; i < turns; i += 1)
    await act(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
    });
};
/** Settles until the check holds. */
async function until(check: () => void) {
  for (let i = 0; i < 500; i += 1) {
    try {
      check();
      return;
    } catch {
      await settle(1);
    }
  }
  check();
}
/** Moves the clock of the waits on, then lets what it started settle. */
const pass = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await settle();
};

/** Opens the page signed in, then puts the waits on a clock the test moves by hand. */
async function open() {
  const view = renderApp(<Harness />, 'bn', { path: '/form' });
  await screen.findByTestId('state');
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  return view;
}

beforeEach(() => {
  resetClientForTests();
  refreshAs({ ...ME, roles: ['monitoring_team'] });
  staleCalls = 0;
  states = [];
  holding = false;
  held = [];
  afterSave = null;
});
afterEach(() => vi.useRealTimers());

describe('saving the draft', () => {
  it('sends the last change a while after it, on the version read, and the next on the saved one', async () => {
    api(ok);
    await open();
    press('change');
    press('change');
    expect(text('state')).toBe('pending');
    await pass(SAVE_DELAY_MS - 1);
    expect(saves).toHaveLength(0);
    await pass(1);
    await until(() => expect(text('state')).toBe('saved'));
    expect(saves).toEqual([{ text: 'বদল 2', ifMatch: '"v1"', left: false }]);
    press('change');
    await pass(SAVE_DELAY_MS);
    await until(() => expect(saves).toHaveLength(2));
    expect(saves[1]).toMatchObject({ text: 'বদল 3', ifMatch: '"v2"' });
  });

  it('sends a save that failed on the way again after its wait: failed, saving, saved', async () => {
    api(down, ok);
    holding = true;
    await open();
    press('change');
    await pass(SAVE_DELAY_MS);
    await until(() => expect(held).toHaveLength(1));
    expect(text('state')).toBe('saving');
    release();
    await until(() => expect(text('state')).toBe('failed'));
    expect(text('failure')).toBe('retrying');
    expect(saves).toHaveLength(1);
    await pass(SAVE_RETRY_DELAYS_MS[0]! - 1);
    expect(saves).toHaveLength(1);
    await pass(1);
    await until(() => expect(held).toHaveLength(1));
    expect(text('state')).toBe('saving');
    release();
    await until(() => expect(text('state')).toBe('saved'));
    expect(saves.map((s) => s.text)).toEqual(['বদল 1', 'বদল 1']);
    expect(text('failure')).toBe('');
    expect(states).toEqual(['saved', 'pending', 'saving', 'failed', 'saving', 'saved']);
    // nothing is left to send
    await pass(10 * SAVE_RETRY_EVERY_MS);
    expect(saves).toHaveLength(2);
  });

  it('waits longer after each failure, then the same wait every time, and starts over after a save', async () => {
    api(down, down, down, down, down, down, ok, down, ok);
    await open();
    press('change');
    await pass(SAVE_DELAY_MS);
    await until(() => expect(saves).toHaveLength(1));
    const waits = [...SAVE_RETRY_DELAYS_MS, SAVE_RETRY_EVERY_MS, SAVE_RETRY_EVERY_MS];
    expect(waits).toEqual([2_000, 5_000, 15_000, 30_000, 30_000]);
    let sent = 1;
    for (const wait of [...waits, SAVE_RETRY_EVERY_MS]) {
      await until(() => expect(text('state')).toBe('failed'));
      await pass(wait - 1);
      expect(saves).toHaveLength(sent);
      await pass(1);
      sent += 1;
      await until(() => expect(saves).toHaveLength(sent));
    }
    await until(() => expect(text('state')).toBe('saved'));
    // the next failure starts from the shortest wait again
    press('change');
    await pass(SAVE_DELAY_MS);
    await until(() => expect(text('state')).toBe('failed'));
    await pass(SAVE_RETRY_DELAYS_MS[0]!);
    await until(() => expect(text('state')).toBe('saved'));
    expect(saves.at(-1)!.text).toBe('বদল 2');
  });

  it('sends it again at once when the browser is back online', async () => {
    api(cut, ok);
    await open();
    press('change');
    await pass(SAVE_DELAY_MS);
    await until(() => expect(text('state')).toBe('failed'));
    expect(text('failure')).toBe('retrying');
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await until(() => expect(text('state')).toBe('saved'));
    expect(saves).toHaveLength(2);
    // the wait that was running is gone with it
    await pass(10 * SAVE_RETRY_EVERY_MS);
    expect(saves).toHaveLength(2);
  });

  it('sends it again at once when the person asks', async () => {
    api(down, ok);
    await open();
    press('change');
    await pass(SAVE_DELAY_MS);
    await until(() => expect(text('state')).toBe('failed'));
    press('retry');
    await until(() => expect(text('state')).toBe('saved'));
    expect(saves).toHaveLength(2);
    await pass(10 * SAVE_RETRY_EVERY_MS);
    expect(saves).toHaveLength(2);
  });

  it('does not send a draft the server refused again, keeps its reason, and sends the next change', async () => {
    api(refusedDraft, ok);
    await open();
    press('change');
    await pass(SAVE_DELAY_MS);
    await until(() => expect(text('state')).toBe('failed'));
    expect(text('failure')).toBe('draft');
    expect(text('message')).toBe('কিছু তথ্য সঠিক নয়।');
    // every message of the question, the same sentence once
    expect(JSON.parse(text('errors')!)).toEqual({
      q_note: ['ঘরটি ফর্মে নেই।', 'পরের প্রশ্নের উত্তর বসানো হয়েছে।'],
    });
    await pass(10 * SAVE_RETRY_EVERY_MS);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await settle();
    expect(saves).toHaveLength(1);
    expect(text('state')).toBe('failed');
    // the person changes the draft: that one is sent, and its messages go
    press('change');
    await pass(SAVE_DELAY_MS);
    await until(() => expect(text('state')).toBe('saved'));
    expect(saves.map((s) => s.text)).toEqual(['বদল 1', 'বদল 2']);
    expect(JSON.parse(text('errors')!)).toEqual({});
  });

  it('reads the draft again when the version was changed elsewhere, and sends nothing more', async () => {
    api(() => apiError(412, 'conflict.stale_version', 'অন্য কেউ বদলেছেন।'));
    await open();
    press('change');
    await pass(SAVE_DELAY_MS);
    await until(() => expect(staleCalls).toBe(1));
    expect(text('state')).toBe('saved');
    expect(text('flags')).toBe('stale');
    await pass(10 * SAVE_RETRY_EVERY_MS);
    expect(saves).toHaveLength(1);
  });

  it('stops for good when the person may not save', async () => {
    api(() => apiError(403, 'permission.denied', 'অনুমতি নেই।'));
    await open();
    press('change');
    await pass(SAVE_DELAY_MS);
    await until(() => expect(text('flags')).toBe('refused'));
    press('change');
    press('retry');
    await pass(10 * SAVE_RETRY_EVERY_MS);
    expect(saves).toHaveLength(1);
  });

  it('sends nothing after the page is gone', async () => {
    api(down);
    const view = await open();
    press('change');
    await pass(SAVE_DELAY_MS);
    await until(() => expect(text('state')).toBe('failed'));
    view.unmount();
    await pass(10 * SAVE_RETRY_EVERY_MS);
    expect(saves).toHaveLength(1);
  });

  it('counts a save that never answers as failed after its time limit, and sends it again', async () => {
    api(never, ok);
    await open();
    press('change');
    await pass(SAVE_DELAY_MS);
    await until(() => expect(saves).toHaveLength(1));
    expect(text('state')).toBe('saving');
    await pass(SAVE_TIMEOUT_MS - 1);
    expect(text('state')).toBe('saving');
    await pass(1);
    await until(() => expect(text('state')).toBe('failed'));
    // a failure on the way, like a lost connection: tried again after the first wait
    expect(text('failure')).toBe('retrying');
    expect(saves).toHaveLength(1);
    await pass(SAVE_RETRY_DELAYS_MS[0]!);
    await until(() => expect(text('state')).toBe('saved'));
    expect(saves.map((s) => s.text)).toEqual(['বদল 1', 'বদল 1']);
    // an answered save leaves no time limit running
    await pass(10 * SAVE_TIMEOUT_MS);
    expect(text('state')).toBe('saved');
    expect(saves).toHaveLength(2);
  });

  it.each([
    ['a wait the server asks for', '10', 10_000],
    ['a day, cut to the longest wait followed', '86400', RETRY_AFTER_MAX_SECONDS * 1_000],
    ['a wait too long for a timer', '99999999999', RETRY_AFTER_MAX_SECONDS * 1_000],
  ])('waits as the busy server asks, never beyond the cap: %s', async (_name, after, wait) => {
    api(busy(after), ok);
    await open();
    press('change');
    await pass(SAVE_DELAY_MS);
    await until(() => expect(text('state')).toBe('failed'));
    expect(text('failure')).toBe('retrying');
    // not at once, and not after the usual first wait
    await pass(SAVE_RETRY_DELAYS_MS[0]!);
    expect(saves).toHaveLength(1);
    await pass(wait - SAVE_RETRY_DELAYS_MS[0]! - 1);
    expect(saves).toHaveLength(1);
    await pass(1);
    await until(() => expect(text('state')).toBe('saved'));
    expect(saves).toHaveLength(2);
  });

  it('does not send the draft again when the page fails after the save, and reports that error as it is', async () => {
    api(ok);
    afterSave = new Error('the page broke after the save');
    // where the browser sends an uncaught error (the test's browser has no such place of its own)
    const reported: unknown[] = [];
    vi.stubGlobal('reportError', (error: unknown) => reported.push(error));
    try {
      await open();
      press('change');
      await pass(SAVE_DELAY_MS);
      await until(() => expect(reported).toEqual([afterSave]));
      // the draft is on the server: nothing failed on the way, and nothing is sent again
      expect(text('state')).toBe('saved');
      expect(text('failure')).toBe('');
      await pass(10 * SAVE_RETRY_EVERY_MS);
      expect(saves).toHaveLength(1);
      expect(reported).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('starts no wait when a save fails after the page is gone', async () => {
    api(down);
    holding = true;
    const view = await open();
    press('change');
    await pass(SAVE_DELAY_MS);
    await until(() => expect(held).toHaveLength(1));
    view.unmount();
    release();
    await settle();
    await pass(10 * SAVE_RETRY_EVERY_MS);
    expect(saves).toHaveLength(1);
  });
});

describe('leaving the page', () => {
  it('saves a change that still waits before the page is left, without asking', async () => {
    api(ok);
    const { router } = await open();
    press('change');
    expect(text('state')).toBe('pending');
    void router.navigate('/elsewhere');
    await until(() => expect(screen.getByTestId('location')).toHaveTextContent('/elsewhere'));
    // the save went out while the page was still there, without the wait after a change
    expect(saves).toEqual([{ text: 'বদল 1', ifMatch: '"v1"', left: false }]);
    expect(states).not.toContain('failed');
  });

  it('leaves at once when everything is saved', async () => {
    api(ok);
    const { router } = await open();
    void router.navigate('/elsewhere');
    await until(() => expect(screen.getByTestId('location')).toHaveTextContent('/elsewhere'));
    expect(saves).toHaveLength(0);
  });

  it('asks only when the save before leaving fails, and stays or goes as the person says', async () => {
    api(down);
    const { router } = await open();
    press('change');
    void router.navigate('/elsewhere');
    await until(() => expect(text('flags')).toBe('asking'));
    expect(saves).toHaveLength(1);
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
    press('stay');
    await settle();
    expect(text('flags')).toBe('');
    expect(text('state')).toBe('failed');
    // the change is still tried again by itself
    await pass(SAVE_RETRY_DELAYS_MS[0]!);
    await until(() => expect(saves).toHaveLength(2));
    await until(() => expect(text('state')).toBe('failed'));
    // a second try to leave saves again, asks again, and this time the person goes
    void router.navigate('/elsewhere');
    await until(() => expect(text('flags')).toBe('asking'));
    expect(saves).toHaveLength(3);
    press('go');
    await until(() => expect(screen.getByTestId('location')).toHaveTextContent('/elsewhere'));
  });

  it('asks once the save before leaving takes long, and leaves by itself when it then goes through', async () => {
    api(ok);
    holding = true;
    const { router } = await open();
    press('change');
    void router.navigate('/elsewhere');
    await until(() => expect(held).toHaveLength(1));
    await pass(LEAVE_ASK_AFTER_MS - 1);
    expect(text('flags')).toBe('');
    await pass(1);
    await until(() => expect(text('flags')).toBe('asking slow'));
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
    release();
    await until(() => expect(screen.getByTestId('location')).toHaveTextContent('/elsewhere'));
    expect(saves).toHaveLength(1);
  });

  it('stays when the person says so while the save still runs, and that save no longer decides', async () => {
    api(ok);
    holding = true;
    const { router } = await open();
    press('change');
    void router.navigate('/elsewhere');
    await until(() => expect(held).toHaveLength(1));
    await pass(LEAVE_ASK_AFTER_MS);
    await until(() => expect(text('flags')).toBe('asking slow'));
    press('stay');
    await settle();
    expect(text('flags')).toBe('');
    release();
    await until(() => expect(text('state')).toBe('saved'));
    await settle();
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
  });

  it('goes when the person says so while the save still runs', async () => {
    api(ok);
    holding = true;
    const { router } = await open();
    press('change');
    void router.navigate('/elsewhere');
    await pass(LEAVE_ASK_AFTER_MS);
    await until(() => expect(text('flags')).toBe('asking slow'));
    press('go');
    await until(() => expect(screen.getByTestId('location')).toHaveTextContent('/elsewhere'));
  });

  it('asks when the save before leaving never answers', async () => {
    api(never);
    const { router } = await open();
    press('change');
    void router.navigate('/elsewhere');
    await pass(LEAVE_ASK_AFTER_MS);
    await until(() => expect(text('flags')).toBe('asking slow'));
    // the time limit turns the hang into a failed save: the question stays, no longer as "saving"
    await pass(SAVE_TIMEOUT_MS - LEAVE_ASK_AFTER_MS);
    await until(() => expect(text('flags')).toBe('asking'));
    expect(text('state')).toBe('failed');
  });

  it('keeps one save for a held departure: a further try to leave starts no other', async () => {
    api(down, ok);
    holding = true;
    const { router } = await open();
    press('change');
    void router.navigate('/elsewhere');
    await until(() => expect(held).toHaveLength(1));
    // the person tries again, and somewhere else, while the first try is held
    void router.navigate('/elsewhere');
    void router.navigate('/another');
    await settle();
    expect(saves).toHaveLength(1);
    expect(held).toHaveLength(1);
    // that one save fails: asked once, nothing sent meanwhile
    release();
    await until(() => expect(text('flags')).toBe('asking'));
    expect(saves).toHaveLength(1);
    void router.navigate('/another');
    await settle();
    expect(saves).toHaveLength(1);
    expect(text('flags')).toBe('asking');
    // going leads to the place asked for last
    press('go');
    await until(() => expect(screen.getByTestId('location')).toHaveTextContent('/another'));
  });

  it('lets a departure after a stay be decided by its own save, not by the one before', async () => {
    api(down, ok);
    holding = true;
    const { router } = await open();
    press('change');
    void router.navigate('/elsewhere');
    await until(() => expect(held).toHaveLength(1));
    await pass(LEAVE_ASK_AFTER_MS);
    await until(() => expect(text('flags')).toBe('asking slow'));
    press('stay');
    await settle();
    // the first save is still on its way when the person leaves again
    void router.navigate('/elsewhere');
    await settle();
    expect(text('flags')).toBe('');
    // it fails; the second departure joined it, so the person is asked, once
    release();
    await until(() => expect(text('flags')).toBe('asking'));
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
  });
});
