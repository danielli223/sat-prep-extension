import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountHost } from './host';
import { renderStartPanel } from './start-panel';

beforeEach(() => { document.body.innerHTML = ''; });

describe('renderStartPanel', () => {
  it('offers list + randomize and hides Resume when no session exists', () => {
    const shadow = mountHost(document);
    renderStartPanel(shadow, { hasSession: false }, { onStartList: vi.fn(), onStartRandom: vi.fn(), onResume: vi.fn() });
    expect(shadow.querySelector('.fp-start-list')).not.toBeNull();
    expect(shadow.querySelector('.fp-start-random')).not.toBeNull();
    expect(shadow.querySelector('.fp-resume')).toBeNull();
    expect(shadow.querySelector('.fp-onboarding')!.textContent).toContain('never store them');
  });

  it('shows Resume when a session exists and fires the right handlers', () => {
    const shadow = mountHost(document);
    const h = { onStartList: vi.fn(), onStartRandom: vi.fn(), onResume: vi.fn() };
    renderStartPanel(shadow, { hasSession: true }, h);
    (shadow.querySelector('.fp-resume') as HTMLElement).click();
    (shadow.querySelector('.fp-start-random') as HTMLElement).click();
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();
    expect(h.onResume).toHaveBeenCalledOnce();
    expect(h.onStartRandom).toHaveBeenCalledOnce();
    expect(h.onStartList).toHaveBeenCalledOnce();
  });
});
