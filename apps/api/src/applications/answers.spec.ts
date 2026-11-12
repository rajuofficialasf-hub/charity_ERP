import type { FormDefinition } from '@css/shared/forms';
import { describe, expect, it } from 'vitest';
import { identityNumber, identityNumberIn, identityOf } from './answers.js';

describe('the identity number as every server reader takes it', () => {
  it('is trimmed, and no number when nothing is left', () => {
    expect(identityNumber(' 1234567890  ')).toBe('1234567890');
    expect(identityNumber('1234567890')).toBe('1234567890');
    for (const none of ['', '   ', '\t', undefined, null, 1234567890, { v: '1234567890' }])
      expect(identityNumber(none), JSON.stringify(none)).toBeNull();
  });

  it('is read from the standard columns with the column the trimmed number fills', () => {
    expect(identityOf({ nid: '1234567890' })).toEqual({ number: '1234567890', column: 'nid' });
    expect(identityOf({ birth_reg: '12345678901234567' })).toEqual({
      number: '12345678901234567',
      column: 'nid',
    });
    expect(identityOf({ birth_reg: '123456789012' })).toEqual({
      number: '123456789012',
      column: 'birth_reg',
    });
    // a number stored with spaces around it was filed under the birth registration by its
    // length: it is the NID it is once trimmed
    expect(identityOf({ birth_reg: ' 1234567890 ' })).toEqual({
      number: '1234567890',
      column: 'nid',
    });
    for (const none of [{}, { nid: '' }, { nid: '  ' }, { birth_reg: '   ' }, { nid: 5 }])
      expect(identityOf(none), JSON.stringify(none)).toBeNull();
    expect(identityOf({ nid: '  ', birth_reg: '   ', name: 'Rahima' })).toBeNull();
  });

  it('is read from the answer of the identity question, whatever its key, and from no other', () => {
    const definition = {
      sections: [
        {
          fields: [
            { fieldKey: 'q_name', standardColumn: 'name' },
            { fieldKey: 'q_document', standardColumn: 'nid_or_birth_reg' },
          ],
        },
      ],
    } as unknown as FormDefinition;
    const answers = (v: unknown) => [
      { fieldKey: 'q_name', value: { t: 'short_text', v: '9999999999' } },
      { fieldKey: 'q_document', repeatIndex: 0, value: { t: 'short_text', v } },
    ];
    expect(identityNumberIn(definition, answers(' 1234567890 '))).toBe('1234567890');
    expect(identityNumberIn(definition, answers('   '))).toBeNull();
    expect(identityNumberIn(definition, answers(undefined))).toBeNull();
    expect(identityNumberIn(definition, [])).toBeNull();
    // a form without the question has no number
    const bare = { sections: [{ fields: [{ fieldKey: 'q_name', standardColumn: 'name' }] }] };
    expect(identityNumberIn(bare as unknown as FormDefinition, answers('1234567890'))).toBeNull();
  });
});
