// The single overlay host (contract §2.1). Idempotent: one <div id="focused-practice-root"> on
// doc.body, an OPEN shadow root, and the "focused-practice" TrustedTypes policy. ALL extension UI
// (focus card, start panel, calculator, and — in later plans — the journal panel + banners) mounts
// inside this ONE root. Spec §8.4: every innerHTML write goes through html().

export const HOST_ID = 'focused-practice-root';
export const TT_POLICY = 'focused-practice';

interface TTPolicy { createHTML(s: string): unknown; }
let policy: TTPolicy | null = null;

function ensurePolicy(): void {
  if (policy) return;
  // trustedTypes is absent in happy-dom and older browsers; degrade to the identity transform.
  const tt = (globalThis as { trustedTypes?: { createPolicy(name: string, rules: { createHTML(s: string): string }): TTPolicy } }).trustedTypes;
  if (tt) {
    policy = tt.createPolicy(TT_POLICY, { createHTML: (s: string) => s });
  } else {
    policy = { createHTML: (s: string) => s };
  }
}

// The ONLY way HTML enters the shadow root. Returns a TrustedHTML where supported, else the raw
// string — assignable to .innerHTML either way.
export function html(s: string): unknown {
  ensurePolicy();
  return policy!.createHTML(s);
}

export function mountHost(doc: Document): ShadowRoot {
  ensurePolicy();
  const existing = doc.getElementById(HOST_ID);
  if (existing?.shadowRoot) return existing.shadowRoot;
  const host = doc.createElement('div');
  host.id = HOST_ID;
  doc.body.appendChild(host);
  return host.attachShadow({ mode: 'open' });
}
