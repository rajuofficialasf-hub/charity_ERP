import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveFile } from './save-file';

// A file the API sent, saved by the browser under its name through a link that leaves the page.
afterEach(() => vi.useRealTimers());

describe('saving a file', () => {
  it('clicks a link to the file under its name, then lets the file go', () => {
    vi.useFakeTimers();
    const created = vi.fn(() => 'blob:saved');
    const revoked = vi.fn();
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: revoked });
    const clicks: { href: string; download: string; inPage: boolean }[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push({ href: this.href, download: this.download, inPage: this.isConnected });
    });
    saveFile(new Blob(['x'], { type: 'image/jpeg' }), 'photo-1.jpg');
    expect(clicks).toEqual([{ href: 'blob:saved', download: 'photo-1.jpg', inPage: true }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revoked).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoked).toHaveBeenCalledWith('blob:saved');
    click.mockRestore();
  });
});
