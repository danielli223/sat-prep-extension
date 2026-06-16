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

  // Regression: a legitimate SAT question whose STEM/choices happen to contain block-page
  // vocabulary ("403", "451", "access denied", "429", "too many requests") must NOT disable the
  // overlay. detectBlock must scope to block-page chrome, never question content.
  it('returns null for a real question whose stem contains hostile numbers/words', () => {
    document.body.innerHTML = `
      <div role="dialog" class="cb-modal-container">
        <div class="cb-dialog-container">
          <div class="cb-dialog-header"><h4>Question ID: ab12cd34</h4></div>
          <div class="cb-dialog-content">
            <div class="question">In 451 BCE the archive recorded that access was denied
              to 429 citizens who filed too many requests; a clerk cited rule 403. [SYNTHETIC]</div>
            <div class="answer-choices"><ul><li>403 forbidden petitions [SYNTHETIC]</li>
              <li>451 [SYNTHETIC]</li><li>Access Denied [SYNTHETIC]</li><li>429 [SYNTHETIC]</li></ul></div>
          </div>
        </div>
      </div>`;
    expect(detectBlock(document)).toBeNull();
  });

  it('returns null for a results list that mentions block-page numbers in a skill cell', () => {
    document.body.innerHTML = `
      <div class="results-page">
        <table class="cb-table cb-table-react">
          <tbody>
            <tr class="result-row"><td>ab12cd34</td><td>Hard</td>
              <td>Reading: too many requests and access denied in archives [SYNTHETIC]</td></tr>
          </tbody>
        </table>
      </div>`;
    expect(detectBlock(document)).toBeNull();
  });

  it('detects a bare Akamai access-denied block page (no question chrome, has Reference #)', () => {
    document.body.innerHTML =
      '<h1>Access Denied</h1><p>You don\'t have permission. Reference #18.abcd1234.5678</p>';
    expect(detectBlock(document)).toBe(BLOCK_REASON.ACCESS_DENIED);
  });

  it('does NOT fire on a bare "access denied" mention without Akamai block structure', () => {
    // A stray phrase outside any question chrome but also without the Akamai Reference # block
    // signal is not a block page — fail safe ON, not off.
    document.body.innerHTML = '<p>access was denied to the archive long ago.</p>';
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
