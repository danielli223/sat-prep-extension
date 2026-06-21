import { describe, it, expect, beforeEach } from 'vitest';
import { mountAnswerOverlay, unmountAnswerOverlay, findAnswerContent, renderVerdict, revealRationale, renderNeedAnswer, renderStaleCard } from './answer-overlay';
import { score } from '../scoring';
import type { CardVM } from './view-model';

const vm: CardVM = {
  id: 'ab12cd34', section: 'Math', domain: 'Algebra', skill: 'Linear', difficulty: 'Hard',
  kind: 'mc', choices: [{ letter: 'A', text: '3' }, { letter: 'B', text: '5' }],
  answerKnown: true, position: { index: 1, total: 10 },
};
const noop = () => ({
  onSelect(){}, onEliminate(){}, onCheck(){}, onReveal(){}, onNext(){},
  onToggleCalc(){}, onOpenDesmos(){}, onClose(){}, onNote(){},
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
  it('renders A–D choices, controls, and fires handlers (no trust badge — the student is on CB itself)', () => {
    const ac = cbAnswerContent();
    let picked = ''; let checked = '';
    const shadow = mountAnswerOverlay(ac, vm, { ...noop(),
      onSelect: (l) => { picked = l; }, onCheck: (p) => { checked = p; } });
    expect(shadow.querySelector('.fp-trust')).toBeNull();
    expect(shadow.querySelectorAll('.fp-choice')).toHaveLength(2);
    expect(shadow.querySelector('.fp-progress')!.textContent).toContain('Q 1 of 10');
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
      onToggleCalc: () => calls.push('calc'), onOpenDesmos: () => calls.push('desmos'),
      onNote: (t) => calls.push('note:' + t) });
    // Choices / actions / close stay in the RETURNED (interaction) shadow.
    (shadow.querySelector('.fp-choice[data-letter="A"] .fp-eliminate') as HTMLElement).click();
    (shadow.querySelector('.fp-reveal') as HTMLElement).click();
    (shadow.querySelector('.fp-next') as HTMLElement).click();
    (shadow.querySelector('.fp-overlay-close') as HTMLElement).click();
    // Note / Calculator / Desmos now live in the SEPARATE extras shadow (the LAST direct child).
    const extras = (ac.querySelector('.fp-extras-host') as HTMLElement).shadowRoot!;
    // They must NOT also be present in the returned interaction shadow after the split.
    expect(shadow.querySelector('.fp-note')).toBeNull();
    expect(shadow.querySelector('.fp-calc-pin')).toBeNull();
    expect(shadow.querySelector('.fp-desmos')).toBeNull();
    (extras.querySelector('.fp-calc-pin') as HTMLElement).click();
    (extras.querySelector('.fp-desmos') as HTMLElement).click();
    const note = extras.querySelector('.fp-note') as HTMLTextAreaElement;
    note.value = '  forgot to distribute  ';
    note.dispatchEvent(new Event('change'));
    expect(calls).toEqual(['eliminate','reveal','next','close','calc','desmos','note:forgot to distribute']);
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
    // Revealing the rationale does not change the relative order.
    revealRationale(ac);
    expect(rationale.compareDocumentPosition(extras) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // And the interaction host stays the FIRST child, before the rationale.
    const answerHost = ac.querySelector('.fp-answer-host') as HTMLElement;
    expect(answerHost.compareDocumentPosition(rationale) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the extras shadow holds the note textarea + prompt (the note is kept, not removed)', () => {
    const ac = cbAnswerContent();
    mountAnswerOverlay(ac, vm, noop());
    const extras = (ac.querySelector('.fp-extras-host') as HTMLElement).shadowRoot!;
    expect(extras.querySelector('.fp-note')).not.toBeNull();
    expect(extras.querySelector('.fp-note-label')!.textContent).toContain('Why did you miss it?');
    expect(extras.querySelector('.fp-calc-pin')).not.toBeNull();
    expect(extras.querySelector('.fp-desmos')).not.toBeNull();
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

it('revealRationale un-hides CB\'s native .rationale', () => {
  const ac = cbAnswerContent();
  mountAnswerOverlay(ac, vm, noop());
  expect((ac.querySelector('.rationale') as HTMLElement).style.display).toBe('none');
  const ok = revealRationale(ac);
  expect(ok).toBe(true);
  expect((ac.querySelector('.rationale') as HTMLElement).style.display).toBe('');
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

it('escapes hostile choice text / taxonomy — no live <img>/<script> reaches the shadow (esc is the XSS boundary)', () => {
  const ac = cbAnswerContent();
  const hostileVm = { ...vm,
    skill: '<script>steal()</script>',
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
  // The hostile text survives as TEXT (escaped), so it's visible/inert, not dropped:
  expect(shadow.querySelector('.fp-progress')!.textContent).toContain('<script>steal()</script>');
  expect(shadow.querySelector('.fp-choice[data-letter="A"]')!.textContent).toContain('<img src=x onerror=steal()>');
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
