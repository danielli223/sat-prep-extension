import { describe, it, expect, beforeEach } from 'vitest';
import { renderOnboarding } from './onboarding-page';

describe('renderOnboarding', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="root"></div>'; });

  it('renders a Continue button that closes the tab', () => {
    const closeCalls: number[] = [];
    const originalClose = window.close;
    window.close = () => { closeCalls.push(1); };

    renderOnboarding(document.getElementById('root')!);
    const cont = document.querySelector<HTMLButtonElement>('.fp-onboarding-continue')!;
    expect(cont.textContent).toContain('Continue');
    cont.click();
    expect(closeCalls).toHaveLength(1);

    window.close = originalClose;
  });

  it('renders the telemetry consent section (TELEMETRY_UI_ENABLED is live)', () => {
    const root = document.createElement('div');
    renderOnboarding(root);
    expect(root.querySelector('.fp-telemetry')).toBeTruthy();
    const toggle = root.querySelector<HTMLInputElement>('.fp-telemetry-toggle');
    expect(toggle!.checked).toBe(false);   // first-run ask is OFF by default
    expect(root.textContent).toMatch(/PostHog/);
    // The continue button still renders.
    expect(root.querySelector('.fp-onboarding-continue')).toBeTruthy();
  });

  it('dismissing first-run posts the anonymous decline signal to the background', () => {
    const sent: unknown[] = [];
    (globalThis as Record<string, unknown>).chrome = {
      runtime: { id: 'ext', sendMessage: (m: unknown) => { sent.push(m); } },
    };
    const originalClose = window.close;
    window.close = () => {};

    renderOnboarding(document.getElementById('root')!);
    document.querySelector<HTMLButtonElement>('.fp-onboarding-continue')!.click();

    // Only the message type crosses — the UI never decides whether it counts, and never builds a
    // payload. The background no-ops if they opted in or if this install already counted.
    expect(sent).toEqual([{ type: 'telemetry-declined' }]);

    window.close = originalClose;
    delete (globalThis as Record<string, unknown>).chrome;
  });

  it('still closes the tab when there is no message receiver', () => {
    const closeCalls: number[] = [];
    const originalClose = window.close;
    window.close = () => { closeCalls.push(1); };
    (globalThis as Record<string, unknown>).chrome = {
      runtime: { id: 'ext', sendMessage: () => { throw new Error('no receiver'); } },
    };

    renderOnboarding(document.getElementById('root')!);
    document.querySelector<HTMLButtonElement>('.fp-onboarding-continue')!.click();
    expect(closeCalls).toHaveLength(1);   // the counter must never block dismissal

    window.close = originalClose;
    delete (globalThis as Record<string, unknown>).chrome;
  });
});
