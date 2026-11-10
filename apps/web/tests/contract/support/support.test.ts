// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { callsIn, normalizedCall } from './calls';
import { at, contractBase } from './session';

describe('the contract test’s address', () => {
  it('skips without an address and takes this machine only', () => {
    expect(contractBase(undefined)).toBeNull();
    expect(contractBase('http://127.0.0.1:4100')).toBe('http://127.0.0.1:4100/api/v1');
    expect(contractBase('http://localhost:4100/')).toBe('http://localhost:4100/api/v1');
  });

  it('refuses a shared server before any request goes out', () => {
    expect(() => contractBase('http://10.11.115.50:4000')).toThrow(/this machine/);
    expect(() => contractBase('https://staging.example.org')).toThrow(/this machine/);
  });
});

describe('the app’s calls read from its source', () => {
  it('finds the path, its method and the parts that change', () => {
    const source = [
      "const a = await api<Profile>('/me/profile');",
      'const b = await api<{ data: Row[] }>(`/projects/${id}/forms?status=draft`);',
      "await api<Unlock>(`/applications/${id}/unlocks`, { method: 'POST', body });",
      'const c = api<T>(path);',
    ].join('\n');
    expect(callsIn(source)).toEqual({
      calls: ['GET /me/profile', 'GET /projects/{}/forms', 'POST /applications/{}/unlocks'],
      unread: [4],
    });
  });

  it('records a word in the path where the app’s source has a variable', () => {
    const slot = 'photo';
    const path = at`/me/photos/${slot}?requestId=${'0190a2c3-7b1d-7c2a-9b1e-2d3f4a5b6c7d'}`;
    expect(path.url).toBe('/me/photos/photo?requestId=0190a2c3-7b1d-7c2a-9b1e-2d3f4a5b6c7d');
    expect(normalizedCall('POST', path.marked)).toBe('POST /me/photos/{}');
  });

  it('writes a call of the run in the same form', () => {
    expect(
      normalizedCall('post', '/applications/0190a2c3-7b1d-7c2a-9b1e-2d3f4a5b6c7d/unlocks'),
    ).toBe('POST /applications/{}/unlocks');
  });
});
