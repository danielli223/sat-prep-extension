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

  it('omits the telemetry consent section by default (TELEMETRY_UI_ENABLED is false until launch)', () => {
    const root = document.createElement('div');
    renderOnboarding(root);
    expect(root.querySelector('.fp-telemetry')).toBeNull();
    expect(root.textContent).not.toMatch(/PostHog/);
    // The continue button still renders.
    expect(root.querySelector('.fp-onboarding-continue')).toBeTruthy();
  });
});
