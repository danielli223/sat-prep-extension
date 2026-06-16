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

// Styles toward the approved focus-card mockup (.superpowers brainstorm focus-card-loop): a dimmed
// backdrop with a centered white card, green=correct / red=wrong / blue=selected. Scoped to this
// shadow root, so nothing leaks to (or is overridden by) College Board's page.
const BASE_CSS = `
.${CARD_SLOT_CLASS}{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
  background:rgba(15,23,42,.55);padding:24px;box-sizing:border-box;pointer-events:auto;
  font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}
.${CARD_SLOT_CLASS}:empty{display:none;}
.${EXTRAS_SLOT_CLASS}{position:fixed;inset:0;pointer-events:none;}
.${EXTRAS_SLOT_CLASS}>*{pointer-events:auto;}
.fp-card,.fp-start{width:100%;max-width:460px;max-height:88vh;overflow:auto;background:#fff;color:#1f2937;
  border-radius:14px;box-shadow:0 16px 48px rgba(0,0,0,.35);padding:20px;box-sizing:border-box;}
.fp-trust{font-size:10px;letter-spacing:.04em;color:#16a34a;font-weight:700;text-transform:uppercase;margin-bottom:10px;}
.fp-trust::before{content:"\\25CF  ";}
.fp-progress{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:#6b7280;
  border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:12px;}
.fp-stem{font-weight:600;line-height:1.5;margin-bottom:14px;}
.fp-stem svg,.fp-stem img{max-width:100%;}
.fp-choices{list-style:none;margin:0 0 12px;padding:0;}
.fp-choice{display:flex;align-items:center;border:1px solid #e5e7eb;border-radius:9px;margin-bottom:7px;}
.fp-choice .fp-eliminate{border:none;background:transparent;color:#9ca3af;cursor:pointer;font-size:14px;padding:8px 4px 8px 10px;}
.fp-choice .fp-pick{flex:1;display:flex;align-items:center;text-align:left;border:none;background:transparent;
  cursor:pointer;padding:9px 12px 9px 2px;color:inherit;font:inherit;}
.fp-choice .fp-letter{font-weight:700;margin-right:8px;}
.fp-choice.fp-selected{border:2px solid #3b82f6;background:#eff6ff;}
.fp-choice.fp-selected .fp-pick::after{content:"selected";margin-left:auto;font-size:9px;color:#3b82f6;font-weight:700;}
.fp-choice.fp-eliminated .fp-pick{color:#9ca3af;text-decoration:line-through;}
.fp-choice.fp-correct{border:2px solid #16a34a;background:#dcfce7;}
.fp-choice.fp-correct .fp-pick::after{content:"\\2713 correct";margin-left:auto;font-size:9px;color:#16a34a;font-weight:700;}
.fp-choice.fp-wrong{border:2px solid #dc2626;background:#fee2e2;}
.fp-choice.fp-wrong .fp-pick::after{content:"\\2717 you chose";margin-left:auto;font-size:9px;color:#dc2626;font-weight:700;}
.fp-gridin-label{display:block;font-size:12px;color:#6b7280;margin-bottom:12px;}
.fp-gridin{display:block;width:100%;margin-top:5px;padding:9px 10px;border:1px solid #d1d5db;border-radius:8px;font:inherit;box-sizing:border-box;}
.fp-actions{display:flex;gap:8px;align-items:center;margin-bottom:10px;}
.fp-check{background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:9px 18px;font-weight:700;cursor:pointer;font:inherit;}
.fp-reveal{background:#f1f5f9;color:#334155;border:none;border-radius:8px;padding:9px 14px;cursor:pointer;font:inherit;}
.fp-next{margin-left:auto;background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer;font:inherit;}
.fp-verdict{margin-bottom:10px;font-weight:700;}
.fp-verdict .fp-ok{color:#16a34a;}
.fp-verdict .fp-no{color:#dc2626;}
.fp-indeterminate{color:#92400e;font-weight:600;font-size:13px;}
.fp-explanation{background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:10px;font-size:13px;color:#4b5563;line-height:1.45;}
.fp-explanation[hidden]{display:none;}
.fp-explanation-label{font-size:10px;color:#16a34a;font-weight:700;text-transform:uppercase;margin-bottom:4px;}
.fp-note-label{display:block;font-size:11px;color:#92400e;margin-bottom:12px;}
.fp-note{display:block;width:100%;margin-top:5px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;
  padding:8px;font:inherit;color:#92400e;resize:vertical;box-sizing:border-box;}
.fp-note::placeholder{color:#b45309;}
.fp-calc{display:flex;gap:8px;}
.fp-calc-pin,.fp-desmos{background:#f1f5f9;color:#334155;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;font:inherit;font-size:12px;}
.fp-onboarding{font-size:12px;color:#0c4a6e;line-height:1.5;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:10px;margin-bottom:14px;}
.fp-start-title{font-size:17px;margin:0 0 12px;color:#0f172a;}
.fp-start>button{display:block;width:100%;margin-bottom:8px;padding:11px;border-radius:9px;border:1px solid #cbd5e1;
  background:#fff;cursor:pointer;font:inherit;font-weight:600;color:#0f172a;}
.fp-start>button.fp-start-list{background:#3b82f6;color:#fff;border-color:#3b82f6;}
`;

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
  const doc = shadow.ownerDocument!;
  const style = doc.createElement('style');
  style.textContent = BASE_CSS;
  const card = doc.createElement('div');
  card.className = CARD_SLOT_CLASS;
  const extras = doc.createElement('div');
  extras.className = EXTRAS_SLOT_CLASS;
  shadow.append(style, card, extras);
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
  // Full-viewport, top of the stack, click-through by default (the visible slots re-enable pointer
  // events). z-index near the 32-bit max so the overlay sits above CB's own modal.
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;';
  doc.body.appendChild(host);
  return host.attachShadow({ mode: 'open' });
}
