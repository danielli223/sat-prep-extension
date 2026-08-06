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

  it('defaults to the module PROMO constant', () => {
    expect(promoHtml()).toBe(promoHtml(PROMO));
  });

  it('placeholder creative avoids College Board / SAT branding (invariant #5)', () => {
    const text = JSON.stringify(PROMO ?? {});
    expect(/college board/i.test(text)).toBe(false);
    expect(/\bSAT\b/.test(text)).toBe(false);
  });
});
