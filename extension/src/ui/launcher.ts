import { cardSlot, extrasSlot } from './host';

// Minimize/restore launcher (design 2026-06-16). The focus card renders into the single
// .fp-card-slot; its ✕ "minimizes" by stashing the slot's LIVE child nodes (not re-rendering),
// so the restored card keeps its selection, verdict, and typed note. A floating pill in the
// persistent extras slot re-attaches those same nodes.
export const CARD_LAUNCHER_CLASS = 'fp-card-launcher';

export interface CardLauncher {
  /** Stash the card slot's children and reveal the pill. No-op when the slot is already empty. */
  minimize(): void;
  /** Drop the stash and hide the pill — call whenever the slot is being repainted. */
  discard(): void;
}

// One controller per shadow root: a second mountCardLauncher returns the first (single pill,
// single click listener, single stash), mirroring mountHost's idempotency.
const controllers = new WeakMap<ShadowRoot, CardLauncher>();

export function mountCardLauncher(shadow: ShadowRoot): CardLauncher {
  const cached = controllers.get(shadow);
  if (cached) return cached;

  const extras = extrasSlot(shadow);   // ensureSlots side effect creates the card slot too
  const pill = shadow.ownerDocument!.createElement('button');
  pill.className = CARD_LAUNCHER_CLASS;
  pill.type = 'button';
  pill.textContent = '📝 Practice';
  pill.hidden = true;
  extras.appendChild(pill);

  let stash: ChildNode[] = [];

  function restore(): void {
    if (stash.length === 0) return;        // nothing minimized (e.g. discarded by a repaint)
    cardSlot(shadow).append(...stash);     // re-attach the SAME nodes → listeners + state intact
    stash = [];
    pill.hidden = true;
  }
  pill.addEventListener('click', restore);

  const controller: CardLauncher = {
    minimize(): void {
      const slot = cardSlot(shadow);
      if (slot.childNodes.length === 0) return;
      stash = [...slot.childNodes];
      slot.replaceChildren();              // empty the slot (CSS :empty hides the dimmed backdrop)
      pill.hidden = false;
    },
    discard(): void {
      stash = [];
      pill.hidden = true;
    },
  };
  controllers.set(shadow, controller);
  return controller;
}
