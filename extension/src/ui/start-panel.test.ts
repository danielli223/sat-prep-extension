import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountHost } from './host';
import { renderStartPanel } from './start-panel';

beforeEach(() => { document.body.innerHTML = ''; });

describe('renderStartPanel', () => {
  it('offers list + randomize and hides Resume when no session exists', () => {
    const shadow = mountHost(document);
    renderStartPanel(shadow, { hasSession: false }, { onStartList: vi.fn(), onStartRandom: vi.fn(), onResume: vi.fn(), onClose: vi.fn() });
    expect(shadow.querySelector('.fp-start-list')).not.toBeNull();
    expect(shadow.querySelector('.fp-start-random')).not.toBeNull();
    expect(shadow.querySelector('.fp-resume')).toBeNull();
    expect(shadow.querySelector('.fp-onboarding')).toBeNull();
  });

  it('renders a ✕ close button that fires onClose', () => {
    const shadow = mountHost(document);
    const h = { onStartList: vi.fn(), onStartRandom: vi.fn(), onResume: vi.fn(), onClose: vi.fn() };
    renderStartPanel(shadow, { hasSession: false }, h);
    const close = shadow.querySelector('.fp-overlay-close') as HTMLElement;
    expect(close).not.toBeNull();
    expect(close.getAttribute('aria-label')).toBe('Close');
    close.click();
    expect(h.onClose).toHaveBeenCalledOnce();
  });

  it('shows Resume when a session exists and fires the right handlers', () => {
    const shadow = mountHost(document);
    const h = { onStartList: vi.fn(), onStartRandom: vi.fn(), onResume: vi.fn(), onClose: vi.fn() };
    renderStartPanel(shadow, { hasSession: true }, h);
    (shadow.querySelector('.fp-resume') as HTMLElement).click();
    (shadow.querySelector('.fp-start-random') as HTMLElement).click();
    (shadow.querySelector('.fp-start-list') as HTMLElement).click();
    expect(h.onResume).toHaveBeenCalledOnce();
    expect(h.onStartRandom).toHaveBeenCalledOnce();
    expect(h.onStartList).toHaveBeenCalledOnce();
  });
});
