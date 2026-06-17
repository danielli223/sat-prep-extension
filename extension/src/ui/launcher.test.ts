import { describe, it, expect, beforeEach } from 'vitest';
import { mountHost, cardSlot, extrasSlot } from './host';
import { mountCardLauncher, CARD_LAUNCHER_CLASS } from './launcher';

beforeEach(() => { document.body.innerHTML = ''; });

function pillOf(shadow: ShadowRoot): HTMLButtonElement {
  return shadow.querySelector(`.${CARD_LAUNCHER_CLASS}`) as HTMLButtonElement;
}

describe('mountCardLauncher', () => {
  it('adds one hidden launcher pill to the extras slot; a second call does not duplicate it', () => {
    const shadow = mountHost(document);
    mountCardLauncher(shadow);
    mountCardLauncher(shadow);                                   // idempotent
    expect(shadow.querySelectorAll(`.${CARD_LAUNCHER_CLASS}`)).toHaveLength(1);
    expect(pillOf(shadow).hidden).toBe(true);                   // hidden until a card is minimized
    expect(pillOf(shadow).textContent).toBe('📝 Practice');
    expect(extrasSlot(shadow).contains(pillOf(shadow))).toBe(true);  // lives in the persistent extras slot
  });

  it('minimize() empties the card slot and reveals the pill', () => {
    const shadow = mountHost(document);
    const launcher = mountCardLauncher(shadow);
    const card = document.createElement('div');
    card.className = 'fp-card';
    cardSlot(shadow).append(card);

    launcher.minimize();

    expect(cardSlot(shadow).children).toHaveLength(0);   // slot emptied → CSS :empty hides the backdrop
    expect(pillOf(shadow).hidden).toBe(false);           // pill now visible
  });

  it('clicking the pill restores the SAME node — listeners and live state survive', () => {
    const shadow = mountHost(document);
    const launcher = mountCardLauncher(shadow);
    const card = document.createElement('div');
    card.className = 'fp-card';
    let clicks = 0;
    card.addEventListener('click', () => { clicks++; });   // a listener a fresh re-render would not carry
    card.classList.add('fp-graded-marker');                // live state a fresh re-render would not reproduce
    cardSlot(shadow).append(card);

    launcher.minimize();
    pillOf(shadow).click();                                // restore

    const restored = cardSlot(shadow).firstElementChild as HTMLElement;
    expect(restored).toBe(card);                           // same node instance, not a re-render
    expect(restored.classList.contains('fp-graded-marker')).toBe(true);
    restored.click();
    expect(clicks).toBe(1);                                // the pre-minimize listener still fires
    expect(pillOf(shadow).hidden).toBe(true);              // pill hidden again after restore
  });

  it('discard() drops the stash and hides the pill; a later pill click is a no-op', () => {
    const shadow = mountHost(document);
    const launcher = mountCardLauncher(shadow);
    const card = document.createElement('div');
    card.className = 'fp-card';
    cardSlot(shadow).append(card);

    launcher.minimize();
    launcher.discard();

    expect(pillOf(shadow).hidden).toBe(true);
    pillOf(shadow).click();                                // nothing stashed → must not restore
    expect(cardSlot(shadow).children).toHaveLength(0);
  });

  it('minimize() on an already-empty slot is a no-op (pill stays hidden)', () => {
    const shadow = mountHost(document);
    const launcher = mountCardLauncher(shadow);
    launcher.minimize();
    expect(pillOf(shadow).hidden).toBe(true);
  });

  it('preserves non-element child nodes (text nodes) across minimize/restore', () => {
    const shadow = mountHost(document);
    const launcher = mountCardLauncher(shadow);
    const slot = cardSlot(shadow);
    // a card element flanked by whitespace text nodes, exactly like innerHTML-rendered content
    slot.append(document.createTextNode('\n  '));
    const card = document.createElement('div');
    card.className = 'fp-card';
    slot.append(card);
    slot.append(document.createTextNode('\n'));

    launcher.minimize();
    expect(slot.childNodes).toHaveLength(0);   // fully emptied (CSS :empty hides the backdrop)

    (shadow.querySelector(`.${CARD_LAUNCHER_CLASS}`) as HTMLButtonElement).click();   // restore
    expect(slot.childNodes).toHaveLength(3);    // both text nodes + the card returned
    expect(slot.firstChild!.nodeType).toBe(Node.TEXT_NODE);
    expect(slot.querySelector('.fp-card')).toBe(card);
  });
});
