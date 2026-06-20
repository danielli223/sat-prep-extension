import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderPopup, renderTelemetryConsent, CB_SEARCH_URL } from './popup';

// Mock telemetry modules so popup.test.ts runs in happy-dom without chrome.storage. Opt-IN stays
// local (optIn writes storage); opt-OUT is delegated to the background via a TELEMETRY_OPTOUT message,
// so the popup no longer imports lifecycle.optOut directly.
vi.mock('../telemetry/consent', () => ({
  optIn: vi.fn().mockResolvedValue('mock-install-id'),
  isOptedIn: vi.fn().mockResolvedValue(false),
}));

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

// The consent surface is gated dark in renderPopup, so we test it directly via renderTelemetryConsent
// to keep full coverage of the 13+ gate, toggle, delete button, and disclosure copy.
describe('telemetry consent UI (renderTelemetryConsent)', () => {
  it('renders an opt-in analytics toggle gated by a 13+ attestation', () => {
    const root = document.createElement('div');
    renderTelemetryConsent(root);
    expect(root.querySelector('.fp-telemetry-age')).toBeTruthy();
    const toggle = root.querySelector<HTMLInputElement>('.fp-telemetry-toggle');
    expect(toggle).toBeTruthy();
    expect(toggle!.disabled).toBe(true); // disabled until 13+ is checked
    expect(root.querySelector('.fp-telemetry-delete')).toBeTruthy();
    expect(root.textContent).toMatch(/PostHog/);
    expect(root.textContent).toMatch(/never the questions|nothing that identifies you/i);
  });

  it('checking the age checkbox enables the analytics toggle', () => {
    const root = document.createElement('div');
    renderTelemetryConsent(root);
    const age = root.querySelector<HTMLInputElement>('.fp-telemetry-age')!;
    const toggle = root.querySelector<HTMLInputElement>('.fp-telemetry-toggle')!;

    expect(toggle.disabled).toBe(true);
    age.checked = true;
    age.dispatchEvent(new Event('change'));
    expect(toggle.disabled).toBe(false);
  });

  it('toggling analytics on calls optIn()', async () => {
    const { optIn } = await import('../telemetry/consent');
    const optInMock = vi.mocked(optIn);
    optInMock.mockClear();

    const root = document.createElement('div');
    renderTelemetryConsent(root);
    const age = root.querySelector<HTMLInputElement>('.fp-telemetry-age')!;
    const toggle = root.querySelector<HTMLInputElement>('.fp-telemetry-toggle')!;

    // First enable the toggle via age checkbox
    age.checked = true;
    age.dispatchEvent(new Event('change'));

    // Then check the toggle to opt in
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));

    expect(optInMock).toHaveBeenCalledOnce();
  });

  it('toggling analytics off sends TELEMETRY_OPTOUT to the background (egress runs there, not in the popup)', () => {
    const sendMessageMock = vi.fn();
    (globalThis as Record<string, unknown>).chrome = { runtime: { id: 'ext', sendMessage: sendMessageMock } };

    const root = document.createElement('div');
    renderTelemetryConsent(root);
    const age = root.querySelector<HTMLInputElement>('.fp-telemetry-age')!;
    const toggle = root.querySelector<HTMLInputElement>('.fp-telemetry-toggle')!;

    // Enable toggle and check it (opt in state)
    age.checked = true;
    age.dispatchEvent(new Event('change'));
    toggle.checked = false; // simulate toggling off
    toggle.dispatchEvent(new Event('change'));

    expect(sendMessageMock).toHaveBeenCalledWith({ type: 'telemetry-optout' });

    delete (globalThis as Record<string, unknown>).chrome;
  });

  it('clicking delete button sends TELEMETRY_DELETE message', () => {
    const sendMessageMock = vi.fn();
    (globalThis as Record<string, unknown>).chrome = {
      runtime: { sendMessage: sendMessageMock },
    };

    const root = document.createElement('div');
    renderTelemetryConsent(root);
    const del = root.querySelector<HTMLButtonElement>('.fp-telemetry-delete')!;

    del.click();

    expect(sendMessageMock).toHaveBeenCalledOnce();
    expect(sendMessageMock).toHaveBeenCalledWith({ type: 'telemetry-delete' });

    // Clean up
    delete (globalThis as Record<string, unknown>).chrome;
  });

  it('delete button resets toggle and age to unauthenticated state', () => {
    const root = document.createElement('div');
    renderTelemetryConsent(root);
    const age = root.querySelector<HTMLInputElement>('.fp-telemetry-age')!;
    const toggle = root.querySelector<HTMLInputElement>('.fp-telemetry-toggle')!;
    const del = root.querySelector<HTMLButtonElement>('.fp-telemetry-delete')!;

    // Simulate opted-in state
    age.checked = true;
    age.dispatchEvent(new Event('change'));
    toggle.checked = true;

    del.click();

    expect(toggle.checked).toBe(false);
    expect(age.checked).toBe(false);
    expect(toggle.disabled).toBe(true);
  });

  it('pre-checks age and toggle when user is already opted in', async () => {
    const { isOptedIn } = await import('../telemetry/consent');
    vi.mocked(isOptedIn).mockResolvedValueOnce(true);

    const root = document.createElement('div');
    renderTelemetryConsent(root);
    const age = root.querySelector<HTMLInputElement>('.fp-telemetry-age')!;
    const toggle = root.querySelector<HTMLInputElement>('.fp-telemetry-toggle')!;

    // Wait for the isOptedIn promise to resolve
    await vi.waitFor(() => {
      expect(age.checked).toBe(true);
      expect(toggle.disabled).toBe(false);
      expect(toggle.checked).toBe(true);
    });
  });
});
