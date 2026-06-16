import { describe, it, expect, beforeEach } from 'vitest';
import { mountHost, HOST_ID, TT_POLICY } from './host';

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
});
