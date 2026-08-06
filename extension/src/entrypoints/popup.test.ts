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

  it('renders the telemetry consent section (TELEMETRY_UI_ENABLED is live)', () => {
    // Rollout step 6: the opt-in ask is user-reachable. It must render OFF and gated behind the 13+
    // attestation — visible ask, no data flow until the student affirmatively turns it on.
    const root = document.createElement('div');
    renderPopup(root);
    expect(root.querySelector('.fp-telemetry')).toBeTruthy();
    const toggle = root.querySelector<HTMLInputElement>('.fp-telemetry-toggle');
    expect(toggle).toBeTruthy();
    expect(toggle!.checked).toBe(false);   // OFF by default
    expect(toggle!.disabled).toBe(true);   // and unreachable until 13+ is attested
    expect(root.querySelector('.fp-telemetry-age')).toBeTruthy();
    expect(root.querySelector('.fp-telemetry-delete')).toBeTruthy();
    expect(root.textContent).toMatch(/PostHog/);   // the processor is named AT the point of consent
    // The non-telemetry surface still renders.
    expect(root.querySelector('a.fp-open-qb')).toBeTruthy();
    expect(root.querySelector('button.fp-open-journal')).toBeTruthy();
  });
});
