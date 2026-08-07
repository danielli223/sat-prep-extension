import { describe, it, expect } from 'vitest';
import { promoHtml, PROMO, type Promo } from './promo';

const base: Promo = { title: 'Thing', body: 'Does stuff.', cta: 'Go', url: 'https://example.com/' };

describe('promoHtml', () => {
  it('renders title, body and a CTA linking to the promo url', () => {
    const out = promoHtml(base);
    expect(out).toContain('Thing');
    expect(out).toContain('Does stuff.');
    expect(out).toContain('href="https://example.com/"');
    expect(out).toContain('>Go</a>');
  });

  it('opens in a new tab without leaking the opener', () => {
    const out = promoHtml(base);
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('renders nothing for a null promo, a blank title, or a non-http(s) url', () => {
    expect(promoHtml(null)).toBe('');
    expect(promoHtml({ ...base, title: '   ' })).toBe('');
    expect(promoHtml({ ...base, url: 'javascript:alert(1)' })).toBe('');
    expect(promoHtml({ ...base, url: 'data:text/html,<b>x</b>' })).toBe('');
    expect(promoHtml({ ...base, url: 'not a url' })).toBe('');
  });

  it('omits the eyebrow and badge when not supplied', () => {
    const out = promoHtml(base);
    expect(out).not.toContain('fp-promo-eyebrow');
    expect(out).not.toContain('fp-promo-badge');
  });

  it('escapes every interpolated field', () => {
    const out = promoHtml({
      eyebrow: '<e>', title: '<t>', body: '<b>', cta: '<c>', badge: '<x>',
      url: 'https://example.com/?a=1&b=2',
    });
    expect(out).not.toContain('<t>');
    expect(out).toContain('&lt;t&gt;');
    expect(out).not.toContain('<b>');
    expect(out).not.toContain('<c>');
    expect(out).not.toContain('<e>');
    expect(out).not.toContain('<x>');
    expect(out).toContain('&amp;b=2');
  });

  it('renders a built-in mark as an svg and tags the badge so it can be recoloured', () => {
    const out = promoHtml({ ...base, mark: 'oasis' });
    expect(out).toContain('<svg viewBox="0 0 1024 1024"');
    expect(out).toContain('fp-promo-badge fp-promo-badge-oasis');
    expect(out).toContain('aria-hidden="true"');
  });

  it('prefers the mark over a text badge', () => {
    const out = promoHtml({ ...base, mark: 'oasis', badge: '★' });
    expect(out).toContain('<svg');
    expect(out).not.toContain('★');
  });

  it('puts the eyebrow heading above the badge row, not beside the title', () => {
    const out = promoHtml({ ...base, eyebrow: 'More from this developer', mark: 'oasis' });
    expect(out.indexOf('fp-promo-eyebrow')).toBeLessThan(out.indexOf('fp-promo-main'));
    expect(out.indexOf('fp-promo-main')).toBeLessThan(out.indexOf('fp-promo-title'));
  });

  it('defaults to the module PROMO constant', () => {
    expect(promoHtml()).toBe(promoHtml(PROMO));
  });

  it('current creative points at our own product over https', () => {
    expect(PROMO?.title).toBe('Oasis Focus');
    expect(promoHtml()).toContain('href="https://oasisfocus.com/"');
  });

  it('creative avoids College Board / SAT branding (invariant #5)', () => {
    const text = JSON.stringify(PROMO ?? {});
    expect(/college board/i.test(text)).toBe(false);
    expect(/\bSAT\b/.test(text)).toBe(false);
  });
});
