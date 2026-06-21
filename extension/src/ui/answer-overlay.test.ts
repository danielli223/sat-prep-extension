import { describe, it, expect, beforeEach } from 'vitest';
import { mountAnswerOverlay, unmountAnswerOverlay, findAnswerContent, renderVerdict, revealRationale, renderNeedAnswer, renderStaleCard, maskAnswerContent, mountCurtain } from './answer-overlay';
import { score } from '../scoring';
import type { CardVM } from './view-model';
import type { MathNode } from '../cb/reader';

const vm: CardVM = {
  id: 'ab12cd34', section: 'Math', domain: 'Algebra', skill: 'Linear', difficulty: 'Hard',
  kind: 'mc', choices: [{ letter: 'A', text: '3' }, { letter: 'B', text: '5' }],
  answerKnown: true, position: { index: 1, total: 10 },
};
// The unified calculator: a SINGLE button wired to onOpenDesmos. onToggleCalc (the old GeoGebra
// in-page toggle) is gone from AnswerHandlers — issue #17 collapses the two controls into one.
const noop = () => ({
  onSelect(){}, onEliminate(){}, onCheck(){}, onReveal(){}, onNext(){},
  onOpenDesmos(){}, onClose(){}, onNote(){},
});

beforeEach(() => { document.body.innerHTML = ''; });

function cbAnswerContent(): HTMLElement {
  document.body.innerHTML =
    '<div class="cb-dialog-container"><div class="answer-content">' +
    '<div class="answer-choices"><ul><li>3</li><li>5</li></ul></div>' +
    '<div class="rationale"><p>Correct Answer: B</p></div>' +
    '</div></div>';
  return findAnswerContent(document.querySelector('.cb-dialog-container')!)!;
}

describe('renders interactive UI', () => {
  it('renders A–D choices, controls, and fires handlers (no trust badge and no taxonomy/position banner — the student is on CB itself)', () => {
    const ac = cbAnswerContent();
    let picked = ''; let checked = '';
    const shadow = mountAnswerOverlay(ac, vm, { ...noop(),
      onSelect: (l) => { picked = l; }, onCheck: (p) => { checked = p; } });
    expect(shadow.querySelector('.fp-trust')).toBeNull();
    expect(shadow.querySelectorAll('.fp-choice')).toHaveLength(2);
    // Issue #19: the "Skill › Difficulty · Q n of N" banner is removed — distracting chrome.
    expect(shadow.querySelector('.fp-progress')).toBeNull();
    (shadow.querySelector('.fp-choice[data-letter="B"] .fp-pick') as HTMLElement).click();
    expect(picked).toBe('B');
    (shadow.querySelector('.fp-check') as HTMLElement).click();
    expect(checked).toBe('B');
  });

  it('renders a grid-in input for kind "grid" and Check reads the typed value', () => {
    const ac = cbAnswerContent();
    const gridVm = { ...vm, kind: 'grid' as const, choices: [] };
    let checked = '';
    const shadow = mountAnswerOverlay(ac, gridVm, { ...noop(), onCheck: (p) => { checked = p; } });
    expect(shadow.querySelector('.fp-gridin-label')).not.toBeNull();
    expect(shadow.querySelectorAll('.fp-choice')).toHaveLength(0);
    (shadow.querySelector('.fp-gridin') as HTMLInputElement).value = '42';
    (shadow.querySelector('.fp-check') as HTMLElement).click();
    expect(checked).toBe('42');
  });

  it('wires the remaining controls to their handlers (interaction shadow + extras shadow)', () => {
    const ac = cbAnswerContent();
    const calls: string[] = [];
    const shadow = mountAnswerOverlay(ac, vm, { ...noop(),
      onEliminate: () => calls.push('eliminate'), onReveal: () => calls.push('reveal'),
      onNext: () => calls.push('next'), onClose: () => calls.push('close'),
      onOpenDesmos: () => calls.push('desmos'),
      onNote: (t) => calls.push('note:' + t) });
    // Choices / actions / close stay in the RETURNED (interaction) shadow.
    (shadow.querySelector('.fp-choice[data-letter="A"] .fp-eliminate') as HTMLElement).click();
    (shadow.querySelector('.fp-reveal') as HTMLElement).click();
    (shadow.querySelector('.fp-next') as HTMLElement).click();
    (shadow.querySelector('.fp-overlay-close') as HTMLElement).click();
    // Note + the single Calculator button now live in the SEPARATE extras shadow (issue #22 + #17).
    const extras = (ac.querySelector('.fp-extras-host') as HTMLElement).shadowRoot!;
    // They must NOT also be present in the returned interaction shadow after the split.
    expect(shadow.querySelector('.fp-note')).toBeNull();
    expect(shadow.querySelector('.fp-calc-open')).toBeNull();
    expect(extras.querySelector('.fp-calc-open')).not.toBeNull();
    const note = extras.querySelector('.fp-note') as HTMLTextAreaElement;
    note.value = '  forgot to distribute  ';
    note.dispatchEvent(new Event('change'));
    expect(calls).toEqual(['eliminate','reveal','next','close','note:forgot to distribute']);
  });

  // Issue #17 — the calculator IS Desmos on the real SAT. We unify the old two affordances (an
  // in-page GeoGebra "Calculator" + a separate "Open real Desmos" button) into ONE button labeled
  // "Calculator" that opens the real Desmos externally. The contract this locks:
  //   - exactly ONE button in .fp-calc, visible label "Calculator"
  //   - clicking it invokes the open-Desmos handler (onOpenDesmos)
  //   - NO second calculator button and NO "Open real Desmos" button survive
  it('renders exactly ONE "Calculator" button that opens the real Desmos (no second/embed button)', () => {
    const ac = cbAnswerContent();
    let openedDesmos = 0;
    const shadow = mountAnswerOverlay(ac, vm, { ...noop(),
      onOpenDesmos: () => { openedDesmos++; } });

    // The calculator now lives in the extras shadow (issue #22 moved note + calc below the explanation).
    expect(shadow.querySelector('.fp-calc')).toBeNull();
    const extras = (ac.querySelector('.fp-extras-host') as HTMLElement).shadowRoot!;
    const calcArea = extras.querySelector('.fp-calc') as HTMLElement;
    expect(calcArea).not.toBeNull();
    const calcButtons = calcArea.querySelectorAll('button');
    expect(calcButtons).toHaveLength(1);                       // exactly one calculator control

    const calcButton = calcButtons[0]! as HTMLButtonElement;
    expect(calcButton.textContent!.trim()).toBe('Calculator'); // the single visible label

    calcButton.click();
    expect(openedDesmos).toBe(1);                              // it opens the real Desmos

    // The old two-tool surface is gone: no "Open real Desmos" button, no GeoGebra/embed toggle button.
    const labels = [...extras.querySelectorAll('button')].map((b) => b.textContent!.trim());
    expect(labels).not.toContain('Open real Desmos');
    expect(extras.querySelector('.fp-desmos')).toBeNull();     // the old second-button selector is gone
    expect(extras.querySelector('.fp-calc-pin')).toBeNull();   // the old GeoGebra-toggle selector is gone
  });
});

describe('mountAnswerOverlay', () => {
  it('mounts a shadow host inside .answer-content and hides CB\'s native choices (whitelist: everything but our hosts)', () => {
    const ac = cbAnswerContent();
    const shadow = mountAnswerOverlay(ac, vm, noop());
    expect(ac.querySelector('.fp-answer-host')!.shadowRoot).toBe(shadow);
    // Whitelist masking: every CB direct child is hidden; BOTH of our hosts stay visible.
    expect((ac.querySelector('.answer-choices') as HTMLElement).style.display).toBe('none');
    expect((ac.querySelector('.rationale') as HTMLElement).style.display).toBe('none');
    expect((ac.querySelector('.fp-answer-host') as HTMLElement).style.display).toBe('');
    // The extras host (note + calc, appended last) must be exempt from the sweep too.
    expect((ac.querySelector('.fp-extras-host') as HTMLElement).style.display).toBe('');
  });

  it('places the extras host AFTER CB\'s .rationale in DOM order (the whole point: note/calc render below the explanation), before and after reveal', () => {
    const ac = cbAnswerContent();
    mountAnswerOverlay(ac, vm, noop());
    const rationale = ac.querySelector('.rationale') as HTMLElement;
    const extras = ac.querySelector('.fp-extras-host') as HTMLElement;
    // Both are direct children of .answer-content.
    expect(extras.parentElement).toBe(ac);
    expect(rationale.parentElement).toBe(ac);
    // Extras follows the rationale in document order — structural, independent of reveal state.
    expect(rationale.compareDocumentPosition(extras) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Revealing the rationale does not change the relative order: extras still trails the explanation.
    revealRationale(ac);
    expect(rationale.compareDocumentPosition(extras) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Per #20, revealing moves CB's rationale ABOVE the interaction host (explanation directly under the
    // question); the extras host (note + calc) still trails LAST, so note/calc stay below the explanation.
    const answerHost = ac.querySelector('.fp-answer-host') as HTMLElement;
    expect(rationale.compareDocumentPosition(answerHost) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ac.lastElementChild).toBe(extras);
  });

  it('the extras shadow holds the note textarea + prompt (the note is kept, not removed)', () => {
    const ac = cbAnswerContent();
    mountAnswerOverlay(ac, vm, noop());
    const extras = (ac.querySelector('.fp-extras-host') as HTMLElement).shadowRoot!;
    expect(extras.querySelector('.fp-note')).not.toBeNull();
    expect(extras.querySelector('.fp-note-label')!.textContent).toContain('Why did you miss it?');
    expect(extras.querySelector('.fp-calc-open')).not.toBeNull();
  });

  it('re-mounting reuses both hosts (no duplicate overlays)', () => {
    const ac = cbAnswerContent();
    mountAnswerOverlay(ac, vm, noop());
    mountAnswerOverlay(ac, vm, noop());
    expect(ac.querySelectorAll('.fp-answer-host')).toHaveLength(1);
    expect(ac.querySelectorAll('.fp-extras-host')).toHaveLength(1);
  });

  it('hides a CB node injected AFTER mount via the MutationObserver (async-injected .rationale leak)', async () => {
    // Mount against an .answer-content with NO .rationale (the live pre-reveal state), then inject one
    // — exactly what CB's async reveal does ~150ms later. The observer must hide it (no inline leak).
    document.body.innerHTML =
      '<div class="cb-dialog-container"><div class="answer-content">' +
      '<div class="answer-choices"><ul><li>3</li><li>5</li></ul></div>' +
      '</div></div>';
    const ac = findAnswerContent(document.querySelector('.cb-dialog-container')!)!;
    mountAnswerOverlay(ac, vm, noop());
    expect(ac.querySelector('.rationale')).toBeNull();   // not present at mount

    const late = document.createElement('div');
    late.className = 'rationale';
    late.innerHTML = '<p>Correct Answer: B</p>';
    ac.appendChild(late);                                // CB injects it later, as a direct child
    await new Promise((r) => setTimeout(r, 0));          // happy-dom fires MutationObserver callbacks async
    expect(late.style.display).toBe('none');             // observer hid it — no leaked "Correct Answer"
  });

  it('keeps the extras host BELOW CB\'s .rationale even when CB injects .rationale AFTER mount (live async-reveal path)', async () => {
    document.body.innerHTML =
      '<div class="cb-dialog-container"><div class="answer-content">' +
      '<div class="answer-choices"><ul><li>3</li><li>5</li></ul></div>' +
      '</div></div>';
    const ac = findAnswerContent(document.querySelector('.cb-dialog-container')!)!;
    mountAnswerOverlay(ac, vm, noop());
    expect(ac.querySelector('.rationale')).toBeNull();   // not present at mount (the live pre-reveal state)

    // CB injects .rationale ~150ms later as a direct child, appended last — same as the observer test.
    const late = document.createElement('div');
    late.className = 'rationale';
    late.innerHTML = '<p>Correct Answer: B</p>';
    ac.appendChild(late);
    await new Promise((r) => setTimeout(r, 0));          // let the MutationObserver run

    const extras = ac.querySelector('.fp-extras-host') as HTMLElement;
    // The extras host must STILL follow the late-injected rationale (note/calc below the explanation)...
    expect(late.compareDocumentPosition(extras) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // ...and it should be the last child (re-anchored to the end after CB's injection).
    expect(ac.lastElementChild).toBe(extras);
  });

  it('findAnswerContent returns null when CB has no .answer-content (overlay no-ops)', () => {
    document.body.innerHTML = '<div class="cb-dialog-container"><div class="cb-dialog-header"></div></div>';
    expect(findAnswerContent(document.querySelector('.cb-dialog-container')!)).toBeNull();
  });
});

describe('unmountAnswerOverlay', () => {
  it('restores the CB nodes WE hid and removes BOTH hosts (no blanked CB question on teardown)', () => {
    const ac = cbAnswerContent();
    mountAnswerOverlay(ac, vm, noop());
    expect((ac.querySelector('.answer-choices') as HTMLElement).style.display).toBe('none');
    expect((ac.querySelector('.rationale') as HTMLElement).style.display).toBe('none');

    unmountAnswerOverlay(ac);

    expect(ac.querySelector('.fp-answer-host')).toBeNull();                          // interaction host gone
    expect(ac.querySelector('.fp-extras-host')).toBeNull();                          // extras host gone
    expect((ac.querySelector('.answer-choices') as HTMLElement).style.display).toBe('');  // CB content back
    expect((ac.querySelector('.rationale') as HTMLElement).style.display).toBe('');
    // Our marker is cleared so a later re-mount + re-teardown stays correct.
    expect(ac.querySelector('[data-fp-hidden]')).toBeNull();
  });

  it('after unmount the observer is disconnected — a later CB injection is NOT hidden', async () => {
    const ac = cbAnswerContent();
    mountAnswerOverlay(ac, vm, noop());
    unmountAnswerOverlay(ac);

    const late = document.createElement('div');
    late.className = 'rationale';   // real class CB uses — a connected observer would hide this
    ac.appendChild(late);
    await new Promise((r) => setTimeout(r, 0));
    expect(late.style.display).toBe('');   // observer gone → CB's own content is left untouched
  });
});

// Issue #38: the FOUC fix masks CB's `.answer-content` children EARLY — the moment the modal is observed,
// BEFORE (and decoupled from) the 150ms-debounced overlay mount — so CB's raw choices never flash. That
// early mask is a standalone primitive (maskAnswerContent) that hides exactly the same way the mount does
// (display:none + the data-fp-hidden marker) but mounts NO host.
//
// Fail-safe (invariant #6): on the degrade path the contract fails and NO overlay ever mounts on the
// early-masked container. The mask MUST still be reversible — closing/tearing down restores CB's own
// native content (visible), never leaving it stuck blank at display:none. This locks that reversibility
// WITHOUT a host having been mounted: mask, then unmount, and assert CB's content is back.
describe('maskAnswerContent (#38 early mask) — fail-safe, host-less reversibility', () => {
  it('masks CB\'s native choices + rationale with no host mounted (the early, pre-overlay state)', () => {
    const ac = cbAnswerContent();
    maskAnswerContent(ac);
    // CB's own nodes are hidden — exactly the masking the overlay mount would apply...
    expect((ac.querySelector('.answer-choices') as HTMLElement).style.display).toBe('none');
    expect((ac.querySelector('.rationale') as HTMLElement).style.display).toBe('none');
    // ...but NO overlay host was mounted (the mask is decoupled from the mount).
    expect(ac.querySelector('.fp-answer-host')).toBeNull();
  });

  it('unmount restores an early-masked container even though no overlay host was ever mounted (degrade path)', () => {
    const ac = cbAnswerContent();
    maskAnswerContent(ac);   // early mask fires; the contract then fails so the overlay NEVER mounts
    expect((ac.querySelector('.answer-choices') as HTMLElement).style.display).toBe('none');

    unmountAnswerOverlay(ac); // fail-safe teardown on the degrade path

    // CB's native content is RESTORED (visible), not stranded blank at display:none (invariant #6)...
    expect((ac.querySelector('.answer-choices') as HTMLElement).style.display).toBe('');
    expect((ac.querySelector('.rationale') as HTMLElement).style.display).toBe('');
    // ...and our hide markers are cleared so a later real mount + teardown stays correct.
    expect(ac.querySelector('[data-fp-hidden]')).toBeNull();
  });
});

// Issue #38 (curtain): the FOUC fix is an OPAQUE host ("white rectangle") dropped the instant CB's
// answer region appears — it both hides CB's raw content AND covers the area with white, so the student
// never sees raw choices before the real overlay fills the SAME host.
describe('mountCurtain (#38 white-rectangle FOUC curtain)', () => {
  it('hides CB\'s raw content and drops an opaque white rectangle, with NO overlay host yet', () => {
    const ac = cbAnswerContent();
    mountCurtain(ac);
    // CB's native content is masked...
    expect((ac.querySelector('.answer-choices') as HTMLElement).style.display).toBe('none');
    expect((ac.querySelector('.rationale') as HTMLElement).style.display).toBe('none');
    // ...and the white rectangle is the FIRST child (covering the region)...
    const curtain = ac.querySelector('.fp-curtain') as HTMLElement;
    expect(curtain).not.toBeNull();
    expect(ac.firstElementChild).toBe(curtain);
    // ...but the real interactive overlay host is NOT mounted yet.
    expect(ac.querySelector('.fp-answer-host')).toBeNull();
  });

  it('is idempotent — repeated calls keep a single curtain', () => {
    const ac = cbAnswerContent();
    mountCurtain(ac);
    mountCurtain(ac);
    expect(ac.querySelectorAll('.fp-curtain')).toHaveLength(1);
  });

  it('mountAnswerOverlay removes the rectangle and mounts the real overlay over it', () => {
    const ac = cbAnswerContent();
    mountCurtain(ac);
    const shadow = mountAnswerOverlay(ac, vm, noop());
    expect(ac.querySelector('.fp-curtain')).toBeNull();              // white rectangle gone
    expect(ac.querySelectorAll('.fp-answer-host')).toHaveLength(1);   // real overlay up (single host)
    expect(shadow.querySelector('.fp-actions')).not.toBeNull();
  });

  it('does not add a curtain once the real overlay is already mounted', () => {
    const ac = cbAnswerContent();
    mountAnswerOverlay(ac, vm, noop());
    mountCurtain(ac);   // e.g. a late early-mask mutation after the overlay already mounted
    expect(ac.querySelector('.fp-curtain')).toBeNull();
  });

  it('unmount tears the curtain down and restores CB\'s content (fail-safe, no real mount)', () => {
    const ac = cbAnswerContent();
    mountCurtain(ac);
    unmountAnswerOverlay(ac);
    expect(ac.querySelector('.fp-curtain')).toBeNull();
    expect((ac.querySelector('.answer-choices') as HTMLElement).style.display).toBe('');
    expect(ac.querySelector('[data-fp-hidden]')).toBeNull();
  });
});

it('revealRationale un-hides CB\'s native .rationale', () => {
  const ac = cbAnswerContent();
  mountAnswerOverlay(ac, vm, noop());
  expect((ac.querySelector('.rationale') as HTMLElement).style.display).toBe('none');
  const ok = revealRationale(ac);
  expect(ok).toBe(true);
  expect((ac.querySelector('.rationale') as HTMLElement).style.display).toBe('');
});

// #20: in Reading, the revealed explanation must sit directly UNDER the question (above our tall
// interaction UI) so the student can read both at once — not be buried below our host. revealRationale
// must move CB's native .rationale ABOVE .fp-answer-host in document order, keep it visible even after
// the masking observer flushes, and NEVER copy its text into our shadow root (CB's node, repositioned).
it('revealRationale repositions CB\'s native .rationale above our interaction host (#20)', async () => {
  const ac = cbAnswerContent();
  const shadow = mountAnswerOverlay(ac, vm, noop());

  expect(revealRationale(ac)).toBe(true);

  const kids = Array.from(ac.children);
  const rationaleIdx = kids.findIndex((c) => c.classList.contains('rationale'));
  const hostIdx = kids.findIndex((c) => c.classList.contains('fp-answer-host'));
  expect(rationaleIdx).toBeGreaterThanOrEqual(0);
  expect(hostIdx).toBeGreaterThanOrEqual(0);
  // The explanation now precedes our interaction UI, so it renders directly beneath the question.
  expect(rationaleIdx).toBeLessThan(hostIdx);

  // Moving a node is a childList mutation — the masking observer must NOT re-hide the node we just
  // deliberately revealed. Flush the (async, happy-dom) observer callback, then assert still visible.
  const rationale = ac.querySelector('.rationale') as HTMLElement;
  await new Promise((r) => setTimeout(r, 0));
  expect(rationale.style.display).toBe('');

  // Invariant: CB's rationale stays CB's own node — its text is repositioned, never re-rendered as
  // ours. The synthetic rationale text must not have leaked into our shadow root.
  expect(shadow.textContent).not.toContain('Correct Answer: B');
});

it('renderVerdict lights the correct choice green and the wrong pick red', () => {
  const ac = cbAnswerContent();
  const shadow = mountAnswerOverlay(ac, vm, noop());
  shadow.querySelector('.fp-choice[data-letter="B"]')!.setAttribute('data-correct', 'true');
  renderVerdict(shadow, { pick: 'A', result: score('A', 'B') });
  expect(shadow.querySelector('.fp-choice[data-letter="A"]')!.classList.contains('fp-wrong')).toBe(true);
  expect(shadow.querySelector('.fp-choice[data-letter="B"]')!.classList.contains('fp-correct')).toBe(true);
});

it('renderVerdict shows the indeterminate message and colors no choice when ungraded', () => {
  const ac = cbAnswerContent();
  const shadow = mountAnswerOverlay(ac, vm, noop());
  shadow.querySelector('.fp-choice[data-letter="B"]')!.setAttribute('data-correct', 'true');
  const ungraded = score('A', '');   // empty correct-answer → not graded; if score() doesn't yield graded:false here, read src/scoring.ts and construct an ungraded ScoreResult literal instead
  renderVerdict(shadow, { pick: 'A', result: ungraded });
  expect(shadow.querySelector('.fp-verdict .fp-indeterminate')).not.toBeNull();
  expect(shadow.querySelector('.fp-choice.fp-correct')).toBeNull();
  expect(shadow.querySelector('.fp-choice.fp-wrong')).toBeNull();
});

it('renderNeedAnswer prompts to select (mc) or enter (grid)', () => {
  const ac = cbAnswerContent();
  const shadow = mountAnswerOverlay(ac, vm, noop());
  renderNeedAnswer(shadow, 'mc');
  expect(shadow.querySelector('.fp-need-answer')!.textContent).toContain('Select');
  renderNeedAnswer(shadow, 'grid');
  expect(shadow.querySelector('.fp-need-answer')!.textContent).toContain('Enter');
});

it('renderStaleCard shows the out-of-sync message in the verdict slot', () => {
  const ac = cbAnswerContent();
  const shadow = mountAnswerOverlay(ac, vm, noop());
  renderStaleCard(shadow);
  const stale = shadow.querySelector('.fp-stale')!;
  expect(stale).not.toBeNull();
  expect(stale.textContent).toContain('out of sync with College Board');
});

it('revealRationale returns false when CB has not injected a .rationale', () => {
  const bare = document.createElement('div');
  expect(revealRationale(bare)).toBe(false);
});

it('escapes hostile choice text — no live <img>/<script> reaches the shadow (esc is the XSS boundary for the rendered choices)', () => {
  const ac = cbAnswerContent();
  const hostileVm = { ...vm,
    choices: [
      { letter: 'A', text: '<img src=x onerror=steal()>' },
      { letter: 'B', text: '<b>ok</b> & <i>stuff</i>' },
    ],
  };
  const shadow = mountAnswerOverlay(ac, hostileVm, noop());
  // No executable/markup nodes from the hostile strings:
  expect(shadow.querySelector('img')).toBeNull();
  expect(shadow.querySelector('script')).toBeNull();
  // No raw HTML elements from the injected markup (b/i inside the choice text):
  expect(shadow.querySelector('.fp-choice b')).toBeNull();
  expect(shadow.querySelector('.fp-choice i')).toBeNull();
  // The hostile choice text survives as TEXT (escaped), so it's visible/inert, not dropped:
  expect(shadow.querySelector('.fp-choice[data-letter="A"]')!.textContent).toContain('<img src=x onerror=steal()>');
});

describe('faithful math rendering in choices (#35)', () => {
  const t = (value: string): MathNode => ({ kind: 'text', value });
  // w = (−150v) / x
  const fracMath: MathNode = {
    kind: 'row',
    items: [
      t('w'), t('='),
      { kind: 'frac', num: { kind: 'row', items: [t('−'), t('150'), t('v')] }, den: t('x') },
    ],
  };
  // m^4 q^20 z^-3
  const supMath: MathNode = {
    kind: 'row',
    items: [
      { kind: 'sup', base: t('m'), sup: t('4') },
      { kind: 'sup', base: t('q'), sup: t('20') },
      { kind: 'sup', base: t('z'), sup: t('-3') },
    ],
  };

  it('renders a fraction choice as .fp-frac with .fp-frac-num and .fp-frac-den (the bar/structure survives)', () => {
    const ac = cbAnswerContent();
    const mathVm: CardVM = { ...vm, choices: [
      { letter: 'A', text: 'w=-150v/x', math: fracMath },
      { letter: 'B', text: '5' },
    ] };
    const shadow = mountAnswerOverlay(ac, mathVm, noop());
    const a = shadow.querySelector('.fp-choice[data-letter="A"]')!;
    const frac = a.querySelector('.fp-frac');
    expect(frac).not.toBeNull();
    expect(frac!.querySelector('.fp-frac-num')!.textContent).toContain('150');
    expect(frac!.querySelector('.fp-frac-den')!.textContent).toContain('x');
    // The leading minus is rendered, not dropped/garbled.
    expect(frac!.querySelector('.fp-frac-num')!.textContent).toMatch(/[−-]/);
  });

  it('renders an exponent choice with a <sup> (superscript survives)', () => {
    const ac = cbAnswerContent();
    const mathVm: CardVM = { ...vm, choices: [
      { letter: 'A', text: 'm4q20z-3', math: supMath },
      { letter: 'B', text: '5' },
    ] };
    const shadow = mountAnswerOverlay(ac, mathVm, noop());
    const a = shadow.querySelector('.fp-choice[data-letter="A"]')!;
    const sups = a.querySelectorAll('sup');
    expect(sups.length).toBeGreaterThanOrEqual(3);
    expect([...sups].map((s) => s.textContent)).toContain('20');
  });

  it('XSS: a hostile text value inside a math AST is ESCAPED — no live <img onerror>/<script> reaches the shadow', () => {
    const ac = cbAnswerContent();
    const hostile: MathNode = {
      kind: 'row',
      items: [
        { kind: 'text', value: '<img src=x onerror=alert(1)>' },
        { kind: 'frac', num: { kind: 'text', value: '<script>steal()</script>' }, den: { kind: 'text', value: '"\'>x' } },
      ],
    };
    const mathVm: CardVM = { ...vm, choices: [
      { letter: 'A', text: 'safe', math: hostile },
      { letter: 'B', text: '5' },
    ] };
    const shadow = mountAnswerOverlay(ac, mathVm, noop());
    // No executable / markup nodes were created from the hostile strings.
    expect(shadow.querySelector('img')).toBeNull();
    expect(shadow.querySelector('script')).toBeNull();
    // The hostile markup survives only as INERT escaped text (visible, not executed).
    const a = shadow.querySelector('.fp-choice[data-letter="A"]')!;
    expect(a.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(a.textContent).toContain('<script>steal()</script>');
    // Our own structural tags ARE present (proves the math path ran, not a plain-text fallback).
    expect(a.querySelector('.fp-frac')).not.toBeNull();
  });

  it('regression: a choice with NO math still renders plain escaped text (unchanged)', () => {
    const ac = cbAnswerContent();
    const shadow = mountAnswerOverlay(ac, vm, noop());
    const a = shadow.querySelector('.fp-choice[data-letter="A"]')!;
    expect(a.querySelector('.fp-frac')).toBeNull();
    expect(a.querySelector('sup')).toBeNull();
    expect(a.textContent).toContain('3');
  });

  it('regression: an image choice still renders <img> (math path does not interfere)', () => {
    const ac = cbAnswerContent();
    const imgVm: CardVM = { ...vm, choices: [
      { letter: 'A', text: '', imgSrc: 'https://example-cb.org/img/choice-a.png' },
      { letter: 'B', text: '5' },
    ] };
    const shadow = mountAnswerOverlay(ac, imgVm, noop());
    const img = shadow.querySelector('.fp-choice[data-letter="A"] img.fp-choice-img') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('https://example-cb.org/img/choice-a.png');
  });
});

// Issue #2 — answer choices were rendered with the answer text as a loose text node directly
// inside the .fp-pick button, beside the letter span:
//   <button class="fp-pick"><span class="fp-letter">A</span> 3</button>
// That cramped layout has no element to lay out the text independently from the letter. The fix
// gives the answer text its OWN element (.fp-choice-text), a sibling of .fp-letter, so the two can
// be laid out cleanly. These tests lock that STRUCTURE (happy-dom computes no geometry, so we cannot
// assert wrapping/lines — we assert the queryable element separation the CSS fix depends on).
describe('issue #2 — answer text gets its own element (compact MC choice formatting)', () => {
  it('puts the choice answer TEXT in a dedicated .fp-choice-text element, not loose in the button', () => {
    const ac = cbAnswerContent();
    const shadow = mountAnswerOverlay(ac, vm, noop());
    const choiceA = shadow.querySelector('.fp-choice[data-letter="A"]')!;

    const textEl = choiceA.querySelector('.fp-choice-text');
    expect(textEl).not.toBeNull();                       // dedicated wrapper exists
    expect(textEl!.textContent).toBe('3');               // it holds exactly the answer text (vm choice A is '3')

    // The text must NOT be a loose text-node sibling of .fp-letter inside the button. Once it lives in
    // .fp-choice-text, the button's only own (non-whitespace) direct text content is empty.
    const pick = choiceA.querySelector('.fp-pick')!;
    const looseText = Array.from(pick.childNodes)
      .filter((n) => n.nodeType === 3)                   // text nodes only
      .map((n) => n.textContent ?? '')
      .join('')
      .trim();
    expect(looseText).toBe('');                          // no answer text directly inside the button
  });

  it('keeps .fp-letter as a SEPARATE element from the answer-text wrapper (letter not inside text, text not inside letter)', () => {
    const ac = cbAnswerContent();
    const shadow = mountAnswerOverlay(ac, vm, noop());
    const choiceA = shadow.querySelector('.fp-choice[data-letter="A"]')!;

    const letterEl = choiceA.querySelector('.fp-letter')!;
    const textEl = choiceA.querySelector('.fp-choice-text')!;
    expect(letterEl).not.toBeNull();
    expect(letterEl.textContent).toBe('A');              // letter still carries the letter

    // The two are distinct, neither nested in the other.
    expect(letterEl).not.toBe(textEl);
    expect(letterEl.contains(textEl)).toBe(false);       // text wrapper is not inside the letter
    expect(textEl.contains(letterEl)).toBe(false);       // letter is not inside the text wrapper
    expect(textEl.querySelector('.fp-letter')).toBeNull();
  });

  it('escapes hostile choice text INSIDE the new .fp-choice-text wrapper (no live <img> reaches the shadow)', () => {
    const ac = cbAnswerContent();
    const hostileVm = { ...vm,
      choices: [{ letter: 'A', text: '<img src=x onerror=steal()>' }],
    };
    const shadow = mountAnswerOverlay(ac, hostileVm, noop());
    const textEl = shadow.querySelector('.fp-choice[data-letter="A"] .fp-choice-text')!;
    expect(textEl).not.toBeNull();
    expect(textEl.querySelector('img')).toBeNull();      // not parsed into a live element
    expect(textEl.textContent).toContain('<img src=x onerror=steal()>');  // survives as inert escaped text
  });
});

it('renderVerdict writes "Correct" for a correct result and "Not quite" for a wrong result', () => {
  const ac = cbAnswerContent();
  const shadow = mountAnswerOverlay(ac, vm, noop());
  shadow.querySelector('.fp-choice[data-letter="B"]')!.setAttribute('data-correct', 'true');

  renderVerdict(shadow, { pick: 'B', result: score('B', 'B') });
  expect(shadow.querySelector('.fp-verdict')!.textContent).toContain('Correct');
  expect(shadow.querySelector('.fp-verdict .fp-ok')).not.toBeNull();

  // Re-mount to reset verdict state, then test wrong answer.
  const shadow2 = mountAnswerOverlay(ac, vm, noop());
  shadow2.querySelector('.fp-choice[data-letter="B"]')!.setAttribute('data-correct', 'true');
  renderVerdict(shadow2, { pick: 'A', result: score('A', 'B') });
  expect(shadow2.querySelector('.fp-verdict')!.textContent).toContain('Not quite');
  expect(shadow2.querySelector('.fp-verdict .fp-no')).not.toBeNull();
});
