import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mountAnswerOverlay, unmountAnswerOverlay, findAnswerContent, renderVerdict, revealRationale, renderNeedAnswer, renderStaleCard, maskAnswerContent, mountCurtain, morphCheckToExplain } from './answer-overlay';
import { score } from '../scoring';
import { readQuestion } from '../cb/reader';
import { toCardVM } from './view-model';
import type { CardVM } from './view-model';
import type { MathNode } from '../cb/reader';

const vm: CardVM = {
  id: 'ab12cd34', section: 'Math', domain: 'Algebra', skill: 'Linear', difficulty: 'Hard',
  kind: 'mc', choices: [{ letter: 'A', text: '3' }, { letter: 'B', text: '5' }],
  answerKnown: true, position: { index: 1, total: 10 },
};
// A Reading vm — CB's non-Math section label. The calculator gate (/math/i) must NOT match this.
const readingVm: CardVM = { ...vm, section: 'Reading and Writing', domain: 'Information and Ideas' };
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

describe("answer text matches College Board's question font", () => {
  // CB renders its questions in its own serif (live-probed as Noto Serif on .answer-content). Our overlay
  // mounts INSIDE .answer-content, so the answer base must INHERIT CB's font rather than pin our own sans
  // stack — that's what makes our choices read in the exact font CB uses for its questions, and follow CB
  // automatically if they ever change it. Controls stay in the system UI font so buttons read as crisp chrome.
  function mountedCss(): string {
    const shadow = mountAnswerOverlay(cbAnswerContent(), vm, noop());
    return shadow.querySelector('style')!.textContent!.replace(/\s+/g, ' ');
  }
  it('inherits CB\'s font for the answer base instead of hardcoding a sans stack', () => {
    const css = mountedCss();
    expect(css).toMatch(/\.fp-answer\s*\{[^}]*font-family:\s*inherit/);
    expect(css).not.toMatch(/\.fp-answer\s*\{[^}]*apple-system/);
  });
  it('keeps interactive controls (e.g. Check) in the system UI font so they stay crisp sans', () => {
    expect(mountedCss()).toMatch(/\.fp-check[^{}]*\{[^}]*apple-system/);
  });
});

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

  it('renders a small non-affiliation disclaimer at the foot of the focus card (distinct from the removed .fp-trust badge)', () => {
    const ac = cbAnswerContent();
    const shadow = mountAnswerOverlay(ac, vm, noop());
    const disclaimer = shadow.querySelector('.fp-disclaimer');
    expect(disclaimer).not.toBeNull();
    expect(disclaimer!.textContent).toMatch(/not affiliated with.*college board/i);
    // Must NOT reintroduce the deliberately-removed trust badge.
    expect(shadow.querySelector('.fp-trust')).toBeNull();
  });

  it('renders a grid-in input for kind "grid" and Check (always visible) reads the typed value', () => {
    const ac = cbAnswerContent();
    const gridVm = { ...vm, kind: 'grid' as const, choices: [] };
    let checked = '';
    const shadow = mountAnswerOverlay(ac, gridVm, { ...noop(), onCheck: (p) => { checked = p; } });
    expect(shadow.querySelector('.fp-gridin-label')).not.toBeNull();
    expect(shadow.querySelectorAll('.fp-choice')).toHaveLength(0);
    // Grid-in has no choice rows to host the button, so .fp-check is shown beside the input from the
    // start (NOT hidden — there's nothing to "move beside" on a selection).
    const check = shadow.querySelector('.fp-check') as HTMLElement;
    expect(check).not.toBeNull();
    expect(check.hidden).toBe(false);
    (shadow.querySelector('.fp-gridin') as HTMLInputElement).value = '42';
    check.click();
    expect(checked).toBe('42');
  });

  it('mc: .fp-check is hidden before any selection and not yet inside a choice row', () => {
    const ac = cbAnswerContent();
    const shadow = mountAnswerOverlay(ac, vm, noop());
    const check = shadow.querySelector('.fp-check') as HTMLElement;
    expect(check).not.toBeNull();          // the single Check button exists…
    expect(check.hidden).toBe(true);       // …but is hidden until the student picks an answer
    // It has not been moved beside any choice yet.
    expect(shadow.querySelector('.fp-choice[data-letter="A"] .fp-check')).toBeNull();
    expect(shadow.querySelector('.fp-choice[data-letter="B"] .fp-check')).toBeNull();
  });

  it('mc: selecting a choice moves the (now-visible) Check beside it; checking fires onCheck with that letter; selecting another moves it', () => {
    const ac = cbAnswerContent();
    let checked = '';
    const shadow = mountAnswerOverlay(ac, vm, { ...noop(), onCheck: (p) => { checked = p; } });

    // Select B → the single Check button is moved INTO B's <li> and revealed.
    (shadow.querySelector('.fp-choice[data-letter="B"] .fp-pick') as HTMLElement).click();
    const checkInB = shadow.querySelector('.fp-choice[data-letter="B"] .fp-check') as HTMLElement;
    expect(checkInB).not.toBeNull();       // moved beside the selected answer
    expect(checkInB.hidden).toBe(false);   // and now visible
    checkInB.click();
    expect(checked).toBe('B');             // clicking it grades the picked letter

    // Select A → the SAME single button moves to A's row and leaves B's row.
    (shadow.querySelector('.fp-choice[data-letter="A"] .fp-pick') as HTMLElement).click();
    expect(shadow.querySelector('.fp-choice[data-letter="A"] .fp-check')).not.toBeNull();
    expect(shadow.querySelector('.fp-choice[data-letter="B"] .fp-check')).toBeNull();
    // Still exactly one Check button in the whole overlay (never one-per-row).
    expect(shadow.querySelectorAll('.fp-check')).toHaveLength(1);
  });

  it('morphCheckToExplain relabels Check → "Explain"; afterward clicking it fires onReveal, NOT onCheck', () => {
    const ac = cbAnswerContent();
    const fired: string[] = [];
    const shadow = mountAnswerOverlay(ac, vm, { ...noop(),
      onCheck: () => fired.push('check'), onReveal: () => fired.push('reveal') });
    // Select B so the (mc) Check is visible and reachable as the morph target.
    (shadow.querySelector('.fp-choice[data-letter="B"] .fp-pick') as HTMLElement).click();

    morphCheckToExplain(shadow);

    const check = shadow.querySelector('.fp-check') as HTMLElement;
    expect(check.textContent).toBe('Explain');                 // exact relabel
    expect(check.classList.contains('fp-explain')).toBe(true); // marker class added
    // The standalone "Reveal explanation" button is KEPT in the DOM but hidden once Explain takes
    // over — no two reveal controls at once (the pre-check peek path is the only reason it survives).
    const reveal = shadow.querySelector('.fp-reveal') as HTMLElement;
    expect(reveal).not.toBeNull();   // still in the DOM (it backs the reveal-without-committing path)
    expect(reveal.hidden).toBe(true);   // …but no longer shown after the morph
    check.click();
    expect(fired).toEqual(['reveal']);   // now reveals CB's own rationale — does NOT re-grade
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

// Issue #23 — Reading declutter. The Math-only calculator must not render on Reading,
// the note field is collapsed until a verdict exists, and the answer stays near the top.
//
// CONTRACT NOTE for the maker: the collapsed/open state is carried by the `fp-note-open`
// class on the `.fp-note-label` element (the note container). renderVerdict and
// renderNeedAnswer add it; a freshly mounted overlay must NOT have it. These tests assert
// against `.fp-note-label` — keep the class on that stable selector.
describe('Reading declutter (issue #23)', () => {
  it('omits the Math-only calculator block on a Reading & Writing question (pure clutter there)', () => {
    const ac = cbAnswerContent();
    mountAnswerOverlay(ac, readingVm, noop());
    // The calculator lives in the extras shadow (issue #22); on Reading it is gated out entirely (#23).
    const extras = (ac.querySelector('.fp-extras-host') as HTMLElement).shadowRoot!;
    expect(extras.querySelector('.fp-calc')).toBeNull();
    expect(extras.querySelector('.fp-calc-open')).toBeNull();
  });

  it('keeps the calculator block on a Math question (Math-only tool stays for Math)', () => {
    const ac = cbAnswerContent();
    mountAnswerOverlay(ac, vm, noop());
    const extras = (ac.querySelector('.fp-extras-host') as HTMLElement).shadowRoot!;
    expect(extras.querySelector('.fp-calc')).not.toBeNull();
    expect(extras.querySelector('.fp-calc-open')).not.toBeNull();
  });

  it('still renders the note field on Reading and fires onNote with the trimmed value (feature preserved)', () => {
    const ac = cbAnswerContent();
    let noted = '';
    mountAnswerOverlay(ac, readingVm, { ...noop(), onNote: (t) => { noted = t; } });
    const extras = (ac.querySelector('.fp-extras-host') as HTMLElement).shadowRoot!;
    expect(extras.querySelector('.fp-note-label')).not.toBeNull();
    const note = extras.querySelector('.fp-note') as HTMLTextAreaElement;
    expect(note).not.toBeNull();
    note.value = '  missed the transition word  ';
    note.dispatchEvent(new Event('change'));
    expect(noted).toBe('missed the transition word');
  });

  it('starts the note collapsed (no fp-note-open) on a fresh mount', () => {
    const ac = cbAnswerContent();
    mountAnswerOverlay(ac, readingVm, noop());
    const extras = (ac.querySelector('.fp-extras-host') as HTMLElement).shadowRoot!;
    const noteLabel = extras.querySelector('.fp-note-label')!;
    expect(noteLabel.classList.contains('fp-note-open')).toBe(false);
  });

  it('expands the note (adds fp-note-open) once renderVerdict writes a result', () => {
    const ac = cbAnswerContent();
    const shadow = mountAnswerOverlay(ac, readingVm, noop());
    const extras = (ac.querySelector('.fp-extras-host') as HTMLElement).shadowRoot!;
    expect(extras.querySelector('.fp-note-label')!.classList.contains('fp-note-open')).toBe(false);
    shadow.querySelector('.fp-choice[data-letter="B"]')!.setAttribute('data-correct', 'true');
    renderVerdict(shadow, { pick: 'B', result: score('B', 'B') });
    expect(extras.querySelector('.fp-note-label')!.classList.contains('fp-note-open')).toBe(true);
  });

  it('expands the note (adds fp-note-open) once renderNeedAnswer prompts the student', () => {
    const ac = cbAnswerContent();
    const shadow = mountAnswerOverlay(ac, readingVm, noop());
    const extras = (ac.querySelector('.fp-extras-host') as HTMLElement).shadowRoot!;
    expect(extras.querySelector('.fp-note-label')!.classList.contains('fp-note-open')).toBe(false);
    renderNeedAnswer(shadow, 'mc');
    expect(extras.querySelector('.fp-note-label')!.classList.contains('fp-note-open')).toBe(true);
  });

  it('renders the answer choices before the actions row in DOM order (answer stays near the top)', () => {
    const ac = cbAnswerContent();
    const shadow = mountAnswerOverlay(ac, readingVm, noop());
    const choices = shadow.querySelector('.fp-choices')!;
    const actions = shadow.querySelector('.fp-actions')!;
    expect(choices).not.toBeNull();
    expect(actions).not.toBeNull();
    // DOCUMENT_POSITION_FOLLOWING => actions comes AFTER choices in document order.
    const rel = choices.compareDocumentPosition(actions);
    expect(rel & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    // Revealing now places CB's explanation BELOW the interaction host (under the choices + Next button)
    // but still ABOVE the extras host (note + calc), which stays LAST.
    const answerHost = ac.querySelector('.fp-answer-host') as HTMLElement;
    expect(answerHost.compareDocumentPosition(rationale) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

describe('seen-before badge (.fp-seen) — issue #28', () => {
  it('renders a "missed" badge when the question was missed before', () => {
    const ac = cbAnswerContent();
    const shadow = mountAnswerOverlay(ac, { ...vm, priorStatus: 'missed' }, noop());
    const seen = shadow.querySelector('.fp-seen');
    expect(seen).not.toBeNull();
    expect(seen!.getAttribute('data-prior')).toBe('missed');
    expect(seen!.textContent).toContain('missed');
  });

  it('renders a "done" badge when the question was answered correctly before', () => {
    const ac = cbAnswerContent();
    const shadow = mountAnswerOverlay(ac, { ...vm, priorStatus: 'done' }, noop());
    const seen = shadow.querySelector('.fp-seen');
    expect(seen).not.toBeNull();
    expect(seen!.getAttribute('data-prior')).toBe('done');
    expect(seen!.textContent).toContain('got it right');
  });

  it('renders a "new" badge for a never-seen question', () => {
    const ac = cbAnswerContent();
    const shadow = mountAnswerOverlay(ac, { ...vm, priorStatus: 'new' }, noop());
    const seen = shadow.querySelector('.fp-seen');
    expect(seen).not.toBeNull();
    expect(seen!.getAttribute('data-prior')).toBe('new');
    expect(seen!.textContent).toContain('New to you');
  });

  it('updates the badge to done/missed after grading (bug: it stayed "New to you" after finishing)', () => {
    const ac = cbAnswerContent();
    const shadow = mountAnswerOverlay(ac, { ...vm, priorStatus: 'new' }, noop());
    expect(shadow.querySelector('.fp-seen')!.getAttribute('data-prior')).toBe('new');
    // A correct grade flips the badge from "New to you" to "done".
    shadow.querySelector('.fp-choice[data-letter="B"]')!.setAttribute('data-correct', 'true');
    renderVerdict(shadow, { pick: 'B', result: score('B', 'B') });
    expect(shadow.querySelector('.fp-seen')!.getAttribute('data-prior')).toBe('done');
    expect(shadow.querySelector('.fp-seen')!.textContent).toContain('got it right');
    // A wrong grade flips it to "missed" (fresh mount resets the badge to "new" first).
    const shadow2 = mountAnswerOverlay(ac, { ...vm, priorStatus: 'new' }, noop());
    renderVerdict(shadow2, { pick: 'A', result: score('A', 'B') });
    expect(shadow2.querySelector('.fp-seen')!.getAttribute('data-prior')).toBe('missed');
    expect(shadow2.querySelector('.fp-seen')!.textContent).toContain('missed');
  });

  it('does NOT touch the badge on an ungraded result (we do not know right/wrong)', () => {
    const ac = cbAnswerContent();
    const shadow = mountAnswerOverlay(ac, { ...vm, priorStatus: 'new' }, noop());
    renderVerdict(shadow, { pick: 'A', result: score('A', '') });   // empty correct answer → ungraded
    expect(shadow.querySelector('.fp-seen')!.getAttribute('data-prior')).toBe('new');
  });

  it('the badge text is ONE of the three fixed labels — never any CB-derived string (leak guard)', () => {
    const ac = cbAnswerContent();
    const shadow = mountAnswerOverlay(ac, { ...vm, priorStatus: 'missed' }, noop());
    const text = shadow.querySelector('.fp-seen')!.textContent!.trim();
    // The label is one of the three fixed strings — no stem (there is none in the VM by design) and
    // no choice text bleeds into it.
    expect(['New to you', 'Seen before — got it right', 'Seen before — missed it']).toContain(text);
    expect(text).not.toContain('5');   // a choice text from `vm` must not appear in the badge
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
it('revealRationale repositions CB\'s native .rationale below our interaction host (above the note + calc)', async () => {
  const ac = cbAnswerContent();
  const shadow = mountAnswerOverlay(ac, vm, noop());

  expect(revealRationale(ac)).toBe(true);

  const kids = Array.from(ac.children);
  const rationaleIdx = kids.findIndex((c) => c.classList.contains('rationale'));
  const hostIdx = kids.findIndex((c) => c.classList.contains('fp-answer-host'));
  const extrasIdx = kids.findIndex((c) => c.classList.contains('fp-extras-host'));
  expect(rationaleIdx).toBeGreaterThanOrEqual(0);
  expect(hostIdx).toBeGreaterThanOrEqual(0);
  // The explanation now sits BELOW our interaction UI (under the choices + Next button) …
  expect(rationaleIdx).toBeGreaterThan(hostIdx);
  // … but ABOVE the extras host (note + calc).
  expect(extrasIdx).toBeGreaterThan(rationaleIdx);

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

  // Issue #80: <mfenced> parentheses must reach the rendered choice. End-to-end through the PUBLIC path
  // (readQuestion → toCardVM → mountAnswerOverlay) so the test fails today because the READER drops the
  // attribute-carried parens (renderMath then has nothing to render), and passes once the reader emits
  // them. The fixture is SYNTHETIC (fabricated MathML, per CLAUDE.md). renderMath stays unchanged — the
  // fix is parsing-side; this locks that the restored parens actually render.
  const here = dirname(fileURLToPath(import.meta.url));
  const fencedVm = (): CardVM =>
    toCardVM(readQuestion(((): Element => {
      document.body.innerHTML = readFileSync(
        join(here, '..', 'cb', '__fixtures__', 'math-fenced-choice.html'), 'utf8');
      return document.querySelector('.cb-dialog-container')!;
    })())!, 0, 1);

  it('renders the literal "(" and ")" for an <mfenced> factoring choice (parens reach the shadow)', () => {
    const vmFenced = fencedVm();
    const ac = cbAnswerContent();   // resets document.body to the overlay host
    const shadow = mountAnswerOverlay(ac, vmFenced, noop());
    const a = shadow.querySelector('.fp-choice[data-letter="A"] .fp-choice-text')!;
    expect(a).not.toBeNull();
    // The rendered HTML for choice A (2xy(8x²y + 7)) must carry the literal parens, not just "2xy8x²y+7".
    expect(a.textContent).toContain('(');
    expect(a.textContent).toContain(')');
    // The inner superscript still renders as a <sup> alongside the restored parens.
    expect(a.querySelector('sup')).not.toBeNull();
  });

  // Issue #85 — mixed prose + inline-math choices (full sentences with inline <math> numbers) must render
  // the WHOLE sentence with each number in place, not numbers-only. End-to-end through the PUBLIC path
  // (readQuestion → toCardVM → mountAnswerOverlay) so the test fails today because the READER drops the
  // interleaved prose and concatenates the two inline numbers ("19979,000"); it passes once the reader
  // emits the prose + numbers as a row of text + math nodes in document order (renderMath already handles
  // { kind: 'text' } via esc()). The fixture is SYNTHETIC (fabricated math + prose, per CLAUDE.md).
  const proseVm = (): CardVM =>
    toCardVM(readQuestion(((): Element => {
      document.body.innerHTML = readFileSync(
        join(here, '..', 'cb', '__fixtures__', 'math-prose-choice.html'), 'utf8');
      return document.querySelector('.cb-dialog-container')!;
    })())!, 0, 1);

  it('renders the full prose sentence with both inline numbers in place (not numbers-only, not "19979,000")', () => {
    const vmProse = proseVm();
    const ac = cbAnswerContent();   // resets document.body to the overlay host
    const shadow = mountAnswerOverlay(ac, vmProse, noop());
    const a = shadow.querySelector('.fp-choice[data-letter="A"] .fp-choice-text')!;
    expect(a).not.toBeNull();
    const text = a.textContent!;
    // The distinctive prose words reach the rendered choice (today they are dropped — numbers only).
    expect(text).toContain('subscribers');
    expect(text).toContain('estimates');
    // Both inline numbers render as DISTINCT values…
    expect(text).toContain('1997');
    expect(text).toContain('9,000');
    // …and never as the concatenated mash the bug produces.
    expect(text).not.toContain('19979,000');
    // Spacing is intact: word and number are not run together.
    expect(text).toMatch(/In\s+1997/);
    expect(text).toMatch(/9,000\s+subscribers/);
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

// Live Question Bank: CB renders choice math as inline <img class="math-img"> (data:image/png), and a
// choice that pairs two expressions is an ordered "[img] and [img]" sequence (ChoiceVM.parts). The
// overlay must render EVERY image plus the connective text — not collapse the choice to just "and".
describe('image-based multi-part choices render every <img> + the connective', () => {
  const dataPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  it('renders both math images and the literal connective inside the choice', () => {
    const ac = cbAnswerContent();
    const partsVm: CardVM = { ...vm, choices: [
      { letter: 'A', text: 'p equals 1 and p equals 4', parts: [
        { kind: 'img', src: dataPng, alt: 'p equals 1' },
        { kind: 'text', value: 'and' },
        { kind: 'img', src: dataPng, alt: 'p equals 4' },
      ] },
      { letter: 'B', text: '5' },
    ] };
    const shadow = mountAnswerOverlay(ac, partsVm, noop());
    const a = shadow.querySelector('.fp-choice[data-letter="A"]')!;
    const imgs = a.querySelectorAll('img');
    expect(imgs.length).toBe(2);
    expect(imgs[0]!.getAttribute('alt')).toBe('p equals 1');
    expect(imgs[1]!.getAttribute('alt')).toBe('p equals 4');
    expect(imgs[0]!.getAttribute('src')).toBe(dataPng);
    expect(a.textContent).toContain('and');
  });

  it('XSS: hostile part values are escaped — no live <script>/onerror reaches the shadow', () => {
    const ac = cbAnswerContent();
    const hostileVm: CardVM = { ...vm, choices: [
      { letter: 'A', text: 'x', parts: [
        { kind: 'text', value: '<script>steal()</script>' },
        { kind: 'img', src: 'x" onerror="steal()', alt: 'y' },
      ] },
      { letter: 'B', text: '5' },
    ] };
    const shadow = mountAnswerOverlay(ac, hostileVm, noop());
    expect(shadow.querySelector('script')).toBeNull();
    const a = shadow.querySelector('.fp-choice[data-letter="A"]')!;
    // hostile text survives only as inert escaped text:
    expect(a.textContent).toContain('<script>steal()</script>');
    // the quote-breakout in src did NOT create a real onerror attribute:
    expect(a.querySelector('img')!.hasAttribute('onerror')).toBe(false);
    expect(a.querySelector('img')!.getAttribute('src')).toBe('x" onerror="steal()');
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

// Issue #82: graph (inline-SVG) answer choices with nested a11y point-lists. End-to-end through the
// PUBLIC path (readQuestion → toCardVM → mountAnswerOverlay), so the test fails today for the REAL
// bug — today the reader emits phantom rows + a math choice carrying the verbalized fraction prose,
// so the overlay renders verbalized math text instead of the graph image — and passes once the reader
// surfaces the graph as imgSrc with clean text. The fixture is SYNTHETIC (fabricated graphs + prose,
// per CLAUDE.md). The overlay renderer (choiceBody) already renders imgSrc as <img class="fp-choice-img">.
describe('graph (svg) answer choices render as <img>, not verbalized prose [issue #82]', () => {
  const here2 = dirname(fileURLToPath(import.meta.url));
  const graphVm = (): CardVM =>
    toCardVM(readQuestion(((): Element => {
      document.body.innerHTML = readFileSync(
        join(here2, '..', 'cb', '__fixtures__', 'graph-choice.html'), 'utf8');
      return document.querySelector('.cb-dialog-container')!;
    })())!, 0, 1);

  it('renders one <img class="fp-choice-img"> per graph choice (the graph is shown, not the prose)', () => {
    const vmGraph = graphVm();
    const ac = cbAnswerContent();   // resets document.body to the overlay host
    const shadow = mountAnswerOverlay(ac, vmGraph, noop());
    // The fixture has exactly 4 graph choices; each must surface as a rendered <img>.
    expect(shadow.querySelectorAll('.fp-choice')).toHaveLength(4);
    expect(shadow.querySelectorAll('img.fp-choice-img')).toHaveLength(4);
  });

  it('does NOT leak the verbalized a11y prose into the rendered choices markup', () => {
    const vmGraph = graphVm();
    const ac = cbAnswerContent();
    const shadow = mountAnswerOverlay(ac, vmGraph, noop());
    const choices = shadow.querySelector('.fp-choices') as HTMLElement;
    // The visible/serialized choice markup must not carry the verbalized fraction prose or graph
    // narration. (choiceBody puts c.text into the <img alt>, so a leaked text would surface here too.)
    expect(choices.innerHTML).not.toContain('StartFraction');
    expect(choices.innerHTML).not.toContain('EndFraction');
    expect(choices.innerHTML).not.toContain('opens upward');
    expect(choices.innerHTML).not.toContain('passes through');
    expect(choices.textContent).not.toContain('StartFraction');
    expect(choices.textContent).not.toContain('opens upward');
  });
});
