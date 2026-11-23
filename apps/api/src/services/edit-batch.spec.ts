import { describe, expect, it } from 'vitest';
import { ApiError } from '../i18n/api-error.js';
import { batchHash, checkEach, inOrder, namedRefusal } from './edit-batch.js';

// The shared parts of a change of several details of the own profile: every detail checked before
// anything is written, a refusal named by its detail, the body kept only as a hash.
describe('a change of several details', () => {
  it('checks every detail and names each that failed, by its detail alone', async () => {
    const refusal = checkEach(
      [
        { field: 'education', value: 'স্নাতক' },
        { field: 'facebookId', value: 'not a link' },
        { field: 'email', value: 'no address' },
      ],
      async (item) => {
        if (item.field === 'facebookId') throw new ApiError('validation.facebook_link', 422);
        if (item.field === 'email')
          throw new ApiError('validation.failed', 422, undefined, [
            { path: 'newValue', code: 'validation.email_format' },
          ]);
        return item.value;
      },
    );
    await expect(refusal).rejects.toMatchObject({
      code: 'validation.failed',
      status: 422,
      details: [
        { path: 'facebookId', code: 'validation.facebook_link' },
        { path: 'email', code: 'validation.email_format' },
      ],
    });
    // the values never travel with the refusal
    await refusal.catch((error: unknown) =>
      expect(JSON.stringify(error)).not.toMatch(/not a link|no address/),
    );
  });

  it('answers the checked values in order when every detail passes, and lets other errors through', async () => {
    expect(
      await checkEach([{ field: 'a' }, { field: 'b' }], async (item) => item.field.toUpperCase()),
    ).toEqual(['A', 'B']);
    const gone = new ApiError('permission.not_found', 404);
    await expect(
      checkEach([{ field: 'a' }], async () => {
        throw gone;
      }),
    ).rejects.toBe(gone);
  });

  it('names a detail refused while written, keeping its status', () => {
    const named = namedRefusal('education', new ApiError('registration.request_open', 409));
    expect(named).toMatchObject({
      code: 'registration.request_open',
      status: 409,
      details: [{ path: 'education', code: 'registration.request_open' }],
    });
    const other = new Error('database');
    expect(namedRefusal('education', other)).toBe(other);
  });

  it('knows a body again by its hash, per person, and keeps the order asked', () => {
    const body = { requests: [{ field: 'education', newValue: 'স্নাতক' }] };
    expect(batchHash('u1', body)).toBe(batchHash('u1', structuredClone(body)));
    expect(batchHash('u1', body)).not.toBe(batchHash('u2', body));
    expect(batchHash('u1', body)).not.toContain('স্নাতক');
    expect(inOrder(['b', 'a', 'gone'], [{ id: 'a' }, { id: 'b' }])).toEqual([
      { id: 'b' },
      { id: 'a' },
    ]);
  });
});
