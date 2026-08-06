import { describe, it, expect, vi } from 'vitest';
import { renderTelemetryConsent } from './telemetry-consent';

// Mock telemetry modules so this runs in happy-dom without chrome.storage. Opt-IN stays local
// (optIn writes storage); opt-OUT is delegated to the background via a TELEMETRY_OPTOUT message,
// so this module never imports lifecycle.optOut directly.
vi.mock('../telemetry/consent', () => ({
  optIn: vi.fn().mockResolvedValue('mock-install-id'),
  isOptedIn: vi.fn().mockResolvedValue(false),
}));

// Shared by the toolbar popup and the first-run onboarding tab, both of which gate rendering it
// behind TELEMETRY_UI_ENABLED — tested directly here to keep full coverage of the 13+ gate, toggle,
// delete button, and disclosure copy regardless of which surface it's mounted in.
describe('telemetry consent UI (renderTelemetryConsent)', () => {
  it('renders an opt-in analytics toggle gated by a 13+ attestation', () => {
    const root = document.createElement('div');
    renderTelemetryConsent(root);
    expect(root.querySelector('.fp-telemetry-age')).toBeTruthy();
    const toggle = root.querySelector<HTMLInputElement>('.fp-telemetry-toggle');
    expect(toggle).toBeTruthy();
    expect(toggle!.disabled).toBe(true); // disabled until 13+ is checked
    expect(root.querySelector('.fp-telemetry-delete')).toBeTruthy();
    expect(root.textContent).toMatch(/help us make focused practice better/i);
  });

  // The consent copy is the disclosure the student actually reads when deciding, so it must match
  // runtime behavior and carry the processor + purpose + retention. Regression guard: an old version
  // claimed scores never leave the device, which question_attempted.result contradicts.
  it('discloses the processor, purpose, and retention, and does NOT claim scores stay on-device', () => {
    const root = document.createElement('div');
    renderTelemetryConsent(root);
    const copy = root.textContent ?? '';
    expect(copy).toMatch(/PostHog/);                       // the third-party processor is named
    expect(copy).toMatch(/12 months/i);                    // retention stated before opt-in
    expect(copy).toMatch(/right or wrong/i);               // per-question correctness IS disclosed
    expect(copy).toMatch(/never send the question text/i); // and what is NOT sent
    expect(copy).not.toMatch(/or scores/i);                // the falsified claim must not return
  });

  // The Limited Use commitments must be their OWN emphasised element, not buried mid-paragraph:
  // this is the reassurance students act on, and the no-sale/no-ads posture is what keeps the
  // product clear of the principal CCPA-under-16 and state minor triggers.
  it('gives the no-sale / no-ads / no-profiling promise its own emphasised element', () => {
    const root = document.createElement('div');
    renderTelemetryConsent(root);
    const promise = root.querySelector('.fp-telemetry-promise');
    expect(promise, 'the Limited Use promise needs its own styled element').toBeTruthy();
    const text = promise!.textContent ?? '';
    expect(text).toMatch(/only to improve the extension/i);
    expect(text).toMatch(/never sold/i);
    expect(text).toMatch(/never used for advertising/i);
    expect(text).toMatch(/never used to profile or contact you/i);
  });

  // The full disclosure must stay visible at the decision point — never collapsed behind a
  // "learn more", never truncated. Guard that all three copy blocks actually render.
  it('renders lead, promise, and the full disclosure detail as separate visible blocks', () => {
    const root = document.createElement('div');
    renderTelemetryConsent(root);
    expect(root.querySelector('.fp-telemetry-lead')).toBeTruthy();
    expect(root.querySelector('.fp-telemetry-promise')).toBeTruthy();
    const detail = root.querySelector('.fp-telemetry-detail');
    expect(detail).toBeTruthy();
    expect(detail!.textContent).toMatch(/PostHog/);
    expect(detail!.textContent).toMatch(/12 months/i);
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

  it('toggling analytics off sends TELEMETRY_OPTOUT to the background (egress runs there, not in the UI)', () => {
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
