import { describe, it, expect, vi } from 'vitest';
import { detectBlock, isBlockStatus, BLOCK_REASON } from './block-detect';

describe('block detection', () => {
  it('classifies CB block HTTP statuses', () => {
    expect(isBlockStatus(403)).toBe(true);
    expect(isBlockStatus(429)).toBe(true);
    expect(isBlockStatus(451)).toBe(true);
    expect(isBlockStatus(200)).toBe(false);
    expect(isBlockStatus(404)).toBe(false);
  });

  it('detects a block-page marker in the document and returns a reason (no retry implied)', () => {
    document.body.innerHTML = '<div id="app">Access Denied — Reference #18.abcd</div>';
    expect(detectBlock(document)).toBe(BLOCK_REASON.ACCESS_DENIED);
  });

  it('detects an explicit forbidden status echoed into the page', () => {
    document.body.innerHTML = '<h1>403 Forbidden</h1>';
    expect(detectBlock(document)).toBe(BLOCK_REASON.FORBIDDEN);
  });

  it('returns null when the page is a normal CB results page', () => {
    document.body.innerHTML = '<div role="dialog">Question ID: ab12cd34</div>';
    expect(detectBlock(document)).toBeNull();
  });

  it('never issues a network request while detecting', () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    document.body.innerHTML = '<h1>403 Forbidden</h1>';
    detectBlock(document);
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
