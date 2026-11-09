import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test/auth';
import { stubMatchMedia } from '../../../test/match-media';
import { server } from '../../../test/msw/server';
import { type Address, AddressFields, EMPTY_ADDRESS } from './AddressFields';

const place = (id: string, bn: string) => ({ id, name: { bn, en: bn }, kind: 'x', code: id });
const DIVISION = '01a1b989-f02d-7332-a6ce-f990ce5c5178';
const DISTRICT = '01a1b989-f031-7bf3-87f2-a122d46ae91c';

function Address({ optional }: { optional: boolean }) {
  const [value, setValue] = useState<Address>(EMPTY_ADDRESS);
  return <AddressFields optional={optional} value={value} onChange={setValue} />;
}

describe('the address on a phone', () => {
  beforeEach(() => {
    // a phone: the selects are sheets from the bottom
    stubMatchMedia((query) => !query.includes('dark') && query.includes('max-width'));
    server.use(
      http.get('*/api/v1/locations', ({ request }) => {
        const parent = new URL(request.url).searchParams.get('parentId');
        const rows =
          parent === DIVISION
            ? [place(DISTRICT, 'ঢাকা জেলা')]
            : parent
              ? []
              : [place(DIVISION, 'ঢাকা বিভাগ')];
        return HttpResponse.json({ data: rows, meta: { requestId: 'r' } });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('opens the next level by itself when the address is asked for', async () => {
    const user = userEvent.setup();
    renderApp(<Address optional={false} />);
    await user.click(await screen.findByRole('combobox', { name: /^বিভাগ/ }));
    await user.click(await screen.findByRole('option', { name: 'ঢাকা বিভাগ' }));
    expect(await screen.findByRole('option', { name: 'ঢাকা জেলা' })).toBeInTheDocument();
  });

  it('leaves the next level closed in a filter, where every level may stay empty', async () => {
    const user = userEvent.setup();
    renderApp(<Address optional />);
    await user.click(await screen.findByRole('combobox', { name: /^বিভাগ/ }));
    await user.click(await screen.findByRole('option', { name: 'ঢাকা বিভাগ' }));
    // the district becomes choosable, but its sheet waits for a tap
    expect(await screen.findByRole('combobox', { name: /^জেলা/ })).toBeEnabled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
