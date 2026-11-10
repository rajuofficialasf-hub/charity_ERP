import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRowKeys } from './use-row-keys';

describe('useRowKeys', () => {
  it('gives each row a key that stays with it when a row before it is removed', () => {
    const { result, rerender } = renderHook(({ count }) => useRowKeys(count), {
      initialProps: { count: 3 },
    });
    const [first, second, third] = result.current.keys;
    expect(new Set([first, second, third]).size).toBe(3);
    // the editor removes the first row: its key goes, the others keep theirs
    act(() => result.current.remove(0));
    rerender({ count: 2 });
    expect(result.current.keys).toEqual([second, third]);
  });

  it('adds a new key for a row added at the end and keeps the keys across renders', () => {
    const { result, rerender } = renderHook(({ count }) => useRowKeys(count), {
      initialProps: { count: 1 },
    });
    const [only] = result.current.keys;
    rerender({ count: 1 });
    expect(result.current.keys).toEqual([only]);
    rerender({ count: 2 });
    expect(result.current.keys[0]).toBe(only);
    expect(result.current.keys[1]).not.toBe(only);
  });
});
