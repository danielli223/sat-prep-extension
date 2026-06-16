// The single overlay host (contract §2.1). Idempotent: one <div id="focused-practice-root"> on
// doc.body, an OPEN shadow root, and the "focused-practice" TrustedTypes policy. ALL extension UI
// (focus card, start panel, calculator, and — in later plans — the journal panel + banners) mounts
// inside this ONE root. Spec §8.4: every innerHTML write goes through html().

export const HOST_ID = 'focused-practice-root';
export const TT_POLICY = 'focused-practice';

export const CARD_SLOT_CLASS = 'fp-card-slot';
export const EXTRAS_SLOT_CLASS = 'fp-extras-slot';

interface TTPolicy { createHTML(s: string): unknown; }
let policy: TTPolicy | null = null;

function ensurePolicy(): void {
  if (policy) return;
  // trustedTypes is absent in happy-dom and older browsers; degrade to the identity transform.
  // NOTE: the policy is the identity transform (createHTML: (s) => s) — it provides NO sanitization;
  // it exists only to satisfy a `require-trusted-types-for 'script'` CSP. XSS safety rests entirely
  // on esc() at every CB-derived interpolation in card.ts. A new innerHTML call site MUST esc() its
  // CB-derived inputs; the policy will not catch an unescaped string (contract §2.1 / spec §8.4).
  const tt = (globalThis as { trustedTypes?: { createPolicy(name: string, rules: { createHTML(s: string): string }): TTPolicy } }).trustedTypes;
  if (tt) {
    policy = tt.createPolicy(TT_POLICY, { createHTML: (s: string) => s });
  } else {
    policy = { createHTML: (s: string) => s };
  }
}

// The shadow root holds two sibling slots so a card repaint never clobbers persistent UI:
//   .fp-card-slot   — the focus card / start panel; OVERWRITTEN on every render.
//   .fp-extras-slot — the calculator iframe and other persistent overlays; SURVIVES re-renders.
// Returns the card slot (renderCard/renderStartPanel target this, not the whole shadow root).
export function cardSlot(shadow: ShadowRoot): HTMLElement {
  ensureSlots(shadow);
  return shadow.querySelector(`.${CARD_SLOT_CLASS}`) as HTMLElement;
}

// Returns the persistent extras slot (the calculator mounts here so renderCard can't wipe it).
export function extrasSlot(shadow: ShadowRoot): HTMLElement {
  ensureSlots(shadow);
  return shadow.querySelector(`.${EXTRAS_SLOT_CLASS}`) as HTMLElement;
}

function ensureSlots(shadow: ShadowRoot): void {
  if (shadow.querySelector(`.${CARD_SLOT_CLASS}`)) return;
  const card = shadow.ownerDocument!.createElement('div');
  card.className = CARD_SLOT_CLASS;
  const extras = shadow.ownerDocument!.createElement('div');
  extras.className = EXTRAS_SLOT_CLASS;
  shadow.append(card, extras);
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
