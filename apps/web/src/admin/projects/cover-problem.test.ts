import { describe, expect, it } from 'vitest';
import { ApiFailure } from '../../api/client';
import { ScanNotCleared } from '../../lib/uploads';
import { coverProblemReason } from './CoverField';

// What a program's or a project's dialog says when the record was saved and its cover was not.
describe('the reason a cover was not set', () => {
  const said = (failure: unknown) => coverProblemReason(failure, 'not cleared', 'general');

  it('names a photo the scan did not clear, refused or still waiting', () => {
    expect(said(new ScanNotCleared('infected'))).toBe('not cleared');
    expect(said(new ScanNotCleared('failed'))).toBe('not cleared');
    expect(said(new ScanNotCleared('pending'))).toBe('not cleared');
  });

  it("gives the server's words for a refusal, and the general failure for anything else", () => {
    expect(said(new ApiFailure(422, 'file.cover_invalid', 'এই ছবি কভার হতে পারে না।'))).toBe(
      'এই ছবি কভার হতে পারে না।',
    );
    expect(said(new Error('network'))).toBe('general');
  });
});
