import { afterEach, describe, expect, it } from 'vitest';
import { insideDialog } from './portal.js';

describe('where a list or calendar renders', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('inside the dialog or alert dialog that holds the control', () => {
    document.body.innerHTML =
      '<div role="dialog" id="d"><span id="a"></span></div>' +
      '<div role="alertdialog" id="ad"><span id="b"></span></div>';
    expect(insideDialog(document.getElementById('a'))).toBe(document.getElementById('d'));
    expect(insideDialog(document.getElementById('b'))).toBe(document.getElementById('ad'));
  });

  it('in the page body outside a dialog or before the control exists', () => {
    document.body.innerHTML = '<main><span id="a"></span></main>';
    expect(insideDialog(document.getElementById('a'))).toBe(document.body);
    expect(insideDialog(null)).toBe(document.body);
  });
});
