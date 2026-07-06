import { describe, it, expect, beforeEach } from 'vitest';
import { renderPopup, CB_SEARCH_URL } from './popup';

describe('renderPopup', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="root"></div>'; });

  it('renders a plain link to CB\'s Question Bank (student drives — D3)', () => {
    renderPopup(document.getElementById('root')!);
    const link = document.querySelector('a.fp-open-qb') as HTMLAnchorElement;
    expect(link.href).toBe(CB_SEARCH_URL);
    expect(link.target).toBe('_blank');
    expect(link.textContent).toContain('Open SAT Question Bank');
  });

  it('renders an "Open journal" button', () => {
    renderPopup(document.getElementById('root')!);
    expect(document.querySelector('button.fp-open-journal')!.textContent).toContain('Open journal');
  });

  it('shows the non-affiliation notice (spec §10)', () => {
    renderPopup(document.getElementById('root')!);
    expect(document.body.textContent).toContain('Not affiliated');
  });

  it('omits the telemetry consent section by default (TELEMETRY_UI_ENABLED is false until launch)', () => {
    // The consent UI stays dark until PRIVACY.md + the CWS disclosure ship (plan Rollout step 6).
    // renderPopup must render NO telemetry surface — the live opt-in toggle is not user-reachable.
    const root = document.createElement('div');
    renderPopup(root);
    expect(root.querySelector('.fp-telemetry')).toBeNull();
    expect(root.querySelector('.fp-telemetry-toggle')).toBeNull();
    expect(root.querySelector('.fp-telemetry-age')).toBeNull();
    expect(root.querySelector('.fp-telemetry-delete')).toBeNull();
    expect(root.textContent).not.toMatch(/PostHog/);
    // The non-telemetry surface still renders.
    expect(root.querySelector('a.fp-open-qb')).toBeTruthy();
    expect(root.querySelector('button.fp-open-journal')).toBeTruthy();
  });
});
