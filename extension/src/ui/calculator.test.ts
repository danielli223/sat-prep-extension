import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountHost } from './host';
import { toggleGeoGebra, openDesmos } from './calculator';

beforeEach(() => { document.body.innerHTML = ''; });

describe('toggleGeoGebra', () => {
  it('mounts a GeoGebra iframe into the shadow root on first toggle', () => {
    const shadow = mountHost(document);
    const onAfterFirst = toggleGeoGebra(shadow);
    const iframe = shadow.querySelector('iframe.fp-geogebra') as HTMLIFrameElement | null;
    expect(iframe).not.toBeNull();
    expect(iframe!.src).toBe('https://www.geogebra.org/calculator');
    expect(onAfterFirst).toBe(true);   // now visible
  });

  it('removes the iframe on the second toggle (open → closed)', () => {
    const shadow = mountHost(document);
    toggleGeoGebra(shadow);
    const visible = toggleGeoGebra(shadow);
    expect(visible).toBe(false);
    expect(shadow.querySelector('iframe.fp-geogebra')).toBeNull();
  });
});

describe('openDesmos', () => {
  it('opens desmos.com/calculator in a separate window (not an iframe)', () => {
    const spy = vi.fn();
    vi.stubGlobal('open', spy);
    openDesmos();
    expect(spy).toHaveBeenCalledWith('https://www.desmos.com/calculator', 'fp-desmos', expect.stringContaining('width='));
    vi.unstubAllGlobals();
  });
});
