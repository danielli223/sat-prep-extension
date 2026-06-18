import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkContract, bumpFailureCounter, FAILURE_KEY, FAILURE_COUNT_UNKNOWN } from './contract-check';
import type { QuestionView } from '../cb/reader';

function stubChrome() {
  const mem: Record<string, unknown> = {};
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (k: string) => (k in mem ? { [k]: mem[k] } : {}),
        set: async (o: Record<string, unknown>) => { Object.assign(mem, o); },
      },
    },
  });
  return mem;
}

const ok: QuestionView = {
  id: 'ab12cd34', section: 'Math', domain: 'Algebra', skill: 'Linear equations', difficulty: 'Hard',
  stem: 'stem', choices: [{ letter: 'A', text: '3' }, { letter: 'B', text: '5' }],
  correctAnswer: 'B',
};

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('checkContract', () => {
  it('passes a well-formed multiple-choice view', () => {
    expect(checkContract(ok)).toEqual({ ok: true });
  });

  it('passes a grid-in BEFORE its answer is revealed (the answer is for scoring, not display)', () => {
    // At show time CB has not injected the grid-in answer yet (correctAnswer === null); the card must
    // still render — the answer is polled at Check, never required to PRESENT the question.
    expect(checkContract({ ...ok, choices: [], correctAnswer: null })).toEqual({ ok: true });
  });

  it('fails when readQuestion returned null (unreadable)', () => {
    expect(checkContract(null)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('fails when the id is missing/empty', () => {
    expect(checkContract({ ...ok, id: '' })).toEqual({ ok: false, reason: 'missing-id' });
  });

  it('fails when the read yielded neither a stem nor choices (a failed read)', () => {
    expect(checkContract({ ...ok, stem: '', choices: [], correctAnswer: null })).toEqual({ ok: false, reason: 'no-answerable-content' });
  });
});

describe('bumpFailureCounter', () => {
  it('increments and persists the failure count', async () => {
    const mem = stubChrome();
    expect(await bumpFailureCounter()).toBe(1);
    expect(await bumpFailureCounter()).toBe(2);
    expect(mem[FAILURE_KEY]).toBe(2);
  });

  it('returns the UNKNOWN sentinel (not 0) when storage fails — never collides with "no failures yet"', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: async () => { throw new Error('storage off'); }, set: async () => {} } },
    });
    const got = await bumpFailureCounter();
    expect(got).toBe(FAILURE_COUNT_UNKNOWN);
    expect(got).not.toBe(0); // 0 would be indistinguishable from a clean first read
  });
});

import { renderBanner, BANNER_ID, renderBlockNotice, BLOCK_NOTICE_ID } from './contract-check';
import { mountHost } from '../ui/host';

describe('renderBanner (non-verdict degraded state)', () => {
  it('mounts one dismissible banner inside the shadow host with no red/green verdict', () => {
    document.body.innerHTML = '';
    const root = mountHost(document);
    renderBanner(root);

    const banner = root.getElementById(BANNER_ID)!;
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain("Couldn't read this one");
    expect(banner.textContent).toMatch(/answer it on CB/i);
    // non-verdict: no scoring colors anywhere in the banner
    expect(banner.querySelector('.correct')).toBeNull();
    expect(banner.querySelector('.incorrect')).toBeNull();

    // idempotent: a second render does not stack a duplicate
    renderBanner(root);
    expect(root.querySelectorAll(`#${BANNER_ID}`)).toHaveLength(1);

    // dismissible
    banner.querySelector<HTMLButtonElement>('[data-action="dismiss"]')!.click();
    expect(root.getElementById(BANNER_ID)).toBeNull();
  });
});

describe('renderBlockNotice (§8.3 — disable AND point to CB)', () => {
  it('mounts one non-verdict notice telling the student to use CB directly', () => {
    document.body.innerHTML = '';
    const root = mountHost(document);
    renderBlockNotice(root);

    const notice = root.getElementById(BLOCK_NOTICE_ID)!;
    expect(notice).not.toBeNull();
    expect(notice.textContent).toMatch(/use the question bank directly on CB|answer .* directly on CB/i);
    // non-verdict: no scoring colors
    expect(notice.querySelector('.correct')).toBeNull();
    expect(notice.querySelector('.incorrect')).toBeNull();
    // links the student to CB's own page (we point them there; we never retry/enumerate)
    const link = notice.querySelector<HTMLAnchorElement>('a[href]')!;
    expect(link.href).toMatch(/satsuiteeducatorquestionbank\.collegeboard\.org/i);

    // idempotent: a second render does not stack a duplicate
    renderBlockNotice(root);
    expect(root.querySelectorAll(`#${BLOCK_NOTICE_ID}`)).toHaveLength(1);
  });
});
