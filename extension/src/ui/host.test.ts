import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountHost, HOST_ID, TT_POLICY, cardSlot } from './host';

beforeEach(() => { document.body.innerHTML = ''; });

describe('mountHost', () => {
  it('creates one host element with an OPEN shadow root', () => {
    const shadow = mountHost(document);
    const host = document.getElementById(HOST_ID)!;
    expect(host).not.toBeNull();
    expect(host.shadowRoot).not.toBeNull();          // OPEN root is reachable from the host
    expect(shadow).toBe(host.shadowRoot);
  });

  it('is idempotent: a second call reuses the same host + shadow root', () => {
    const first = mountHost(document);
    const second = mountHost(document);
    expect(second).toBe(first);
    expect(document.querySelectorAll(`#${HOST_ID}`)).toHaveLength(1);
  });

  it('exposes the policy name as a constant', () => {
    expect(TT_POLICY).toBe('focused-practice');
    expect(HOST_ID).toBe('focused-practice-root');
  });

  it('renders HTML into the shadow root via the html() helper', async () => {
    const { mountHost: mh, html } = await import('./host');
    const shadow = mh(document);
    shadow.innerHTML = html('<p class="hello">hi</p>') as unknown as string;
    expect(shadow.querySelector('.hello')?.textContent).toBe('hi');
  });

  it('stops overlay pointer events from reaching the document (so CB never closes its modal under our card)', () => {
    // CB closes its question modal on an outside pointer-down/click. Our overlay sits ON TOP of CB's modal,
    // so a real click on the focus card bubbles to the document and trips CB's close — the modal (and its
    // answer) is gone by Check time → "couldn't grade" (live 2026-06-16; only real mouse events reproduce
    // it, not programmatic .click()). Our overlay's pointer events must not reach the document.
    const shadow = mountHost(document);
    const slot = cardSlot(shadow);
    slot.innerHTML = '<button class="fp-pick">C</button>';
    const onDocMousedown = vi.fn();
    const onDocClick = vi.fn();
    document.addEventListener('mousedown', onDocMousedown);   // mimic CB's close-on-outside listeners
    document.addEventListener('click', onDocClick);

    const btn = shadow.querySelector('.fp-pick')!;
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(onDocMousedown).not.toHaveBeenCalled();   // stopped at the host — never reaches CB's listener
    expect(onDocClick).not.toHaveBeenCalled();
    document.removeEventListener('mousedown', onDocMousedown);
    document.removeEventListener('click', onDocClick);
  });
});
