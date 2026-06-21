import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { indexedDB } from 'fake-indexeddb';

// Issue #70 — path-aware, SPA-reactive boot for the broadened student-portal match.
//
// After CB's login redirect the document commits at /login and the app SPA-routes into
// /questionbank/* WITHOUT a fresh document load, so the old path-scoped manifest match never injected
// the content script. The fix broadens the match to the whole student origin (see packaging.test.ts)
// and PAIRS it with a path-aware boot so our UI only mounts on a real question-bank page — never on
// /dashboard, /login, /details. This file locks the three testable seams the maker must export from
// `content.ts` (or a small colocated module):
//
//   isQuestionBankPage(loc: { hostname: string; pathname: string }): boolean
//   activate(doc: Document): void | Promise<void>     // idempotent; mounts our UI
//   teardown(doc: Document): void                     // removes our UI + observers
//   handleRouteChange(doc: Document): void            // the pushState/popstate hook; gates the above
//
// NONE of these exist yet → this file is RED until the maker implements them.
//
// SCOPE NOTE (what is unit-tested here vs left to the live pass):
//   - The predicate (pure host+path logic) is fully covered.
//   - activate/teardown/handleRouteChange are exercised through the OBSERVABLE UI they own — the
//     Journal toggle `.fp-panel-toggle` (light DOM) and the body host `#focused-practice-root`. That is
//     the gating/idempotency/teardown contract that prevents a green-but-broken regression.
//   - The real content-script INJECTION timing and the live login→SPA flow CANNOT be unit-tested in
//     happy-dom; `/verify-overlay` is the real gate (log out → log in → overlay on /questionbank/results
//     with NO hard reload; UI absent on /dashboard; educator bank still works). Content-free here.
import * as content from './content';
import { HOST_ID } from '../ui/host';

// The #70 seam, declared here so this file type-checks BOTH before the maker adds the exports (they're
// just `undefined` at runtime → the tests below throw "not a function", proving RED for the right
// reason) AND after (the real exports satisfy this shape). We deliberately do NOT use @ts-expect-error
// on the import: that directive would go *unused* once the maker exports these and — since the maker
// may not edit this test — would then break their typecheck. The cast names the contract instead.
const boot = content as unknown as {
  isQuestionBankPage(loc: { hostname: string; pathname: string }): boolean;
  activate(doc: Document): void | Promise<void>;
  teardown(doc: Document): void;
  handleRouteChange(doc: Document): void;
};
const { isQuestionBankPage, activate, teardown, handleRouteChange } = boot;

// guardedStart wraps activation in the §2.5/§8.3 gate (kill-switch + block-detect). Force it OPEN so the
// real boot runner (openStore → runLoop → mountPanelToggle → watchResultsList) runs and we can observe
// the mounted UI. Mirrors the Plan 4 suite in content.test.ts (this is a SEPARATE module, so the mock
// here is scoped to this file and never touches content.test.ts).
vi.mock('../resilience/killswitch', () => ({ isEnabled: vi.fn(async () => true), CACHE_KEY: 'killswitch.enabled' }));
vi.mock('../resilience/block-detect', () => ({ detectBlock: vi.fn(() => null), BLOCK_REASON: {} }));

const EDUCATOR_HOST = 'satsuiteeducatorquestionbank.collegeboard.org';
const STUDENT_HOST = 'mypractice.collegeboard.org';

// Drive the document's location so activate/teardown/handleRouteChange read a realistic host+path.
// happy-dom's history.replaceState with a cross-origin URL throws; setURL is the supported mechanism.
function setLocation(hostname: string, pathname: string): void {
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(`https://${hostname}${pathname}`);
}

async function freshDb(): Promise<void> {
  await new Promise<void>((res) => {
    const r = indexedDB.deleteDatabase('sat-overlay');
    r.onsuccess = () => res();
    r.onerror = () => res();
  });
}

function toggle(): Element | null {
  return document.querySelector('.fp-panel-toggle');
}
function host(): HTMLElement | null {
  return document.getElementById(HOST_ID);
}

describe('isQuestionBankPage — host-keyed predicate (issue #70)', () => {
  it('educator host is QB-dedicated → TRUE for its /digital/* pages (no educator regression)', () => {
    // The #1 way to ship green-but-broken is a predicate that keys on "/questionbank" only and silently
    // disables the EDUCATOR overlay (its pages are /digital/*, not /questionbank/*). The predicate must
    // key on the HOST: the educator bank IS the whole host, so every page on it is a QB page.
    expect(isQuestionBankPage({ hostname: EDUCATOR_HOST, pathname: '/digital/search' })).toBe(true);
    expect(isQuestionBankPage({ hostname: EDUCATOR_HOST, pathname: '/digital/results' })).toBe(true);
  });

  it('student host → TRUE only on /questionbank/*', () => {
    expect(isQuestionBankPage({ hostname: STUDENT_HOST, pathname: '/questionbank/results' })).toBe(true);
    expect(isQuestionBankPage({ hostname: STUDENT_HOST, pathname: '/questionbank/search' })).toBe(true);
  });

  it('student host → FALSE on the portal pages our UI must NOT splatter onto', () => {
    // The broadened match injects the script across the whole student portal; the predicate is what keeps
    // our UI OFF these pages.
    expect(isQuestionBankPage({ hostname: STUDENT_HOST, pathname: '/dashboard' })).toBe(false);
    expect(isQuestionBankPage({ hostname: STUDENT_HOST, pathname: '/login' })).toBe(false);
    expect(isQuestionBankPage({ hostname: STUDENT_HOST, pathname: '/details' })).toBe(false);
  });

  it('an unrelated host → FALSE regardless of path', () => {
    expect(isQuestionBankPage({ hostname: 'example.com', pathname: '/questionbank/results' })).toBe(false);
    expect(isQuestionBankPage({ hostname: 'www.collegeboard.org', pathname: '/digital/search' })).toBe(false);
  });
});

describe('activate / teardown — observable UI gating (issue #70)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    document.getElementById(HOST_ID)?.remove();
    document.querySelector('.fp-panel-toggle')?.remove();
    await freshDb();
    // A chrome stub so the boot runner's chrome.runtime.onMessage / chrome.storage references resolve.
    vi.stubGlobal('chrome', {
      runtime: { id: 'ext-test', onMessage: { addListener: vi.fn() }, sendMessage: vi.fn() },
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) } },
    });
    setLocation(STUDENT_HOST, '/questionbank/results');
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('activate(doc) mounts our UI (Journal toggle + body host) on a QB page', async () => {
    await activate(document);
    await vi.waitFor(() => expect(toggle()).not.toBeNull());   // the .fp-panel-toggle launcher appears
    expect(host()).not.toBeNull();                             // and the single overlay host is mounted
  });

  it('activate(doc) is IDEMPOTENT — a second call does NOT double-mount the toggle', async () => {
    // SPA routing can re-enter a QB page repeatedly; activation must not stack a second toggle/host.
    await activate(document);
    await vi.waitFor(() => expect(toggle()).not.toBeNull());
    await activate(document);
    await vi.waitFor(() => {});   // let any async boot settle
    expect(document.querySelectorAll('.fp-panel-toggle')).toHaveLength(1);
    expect(document.querySelectorAll(`#${HOST_ID}`)).toHaveLength(1);
  });

  it('teardown(doc) removes our UI so nothing lingers when the student routes away', async () => {
    await activate(document);
    await vi.waitFor(() => expect(toggle()).not.toBeNull());

    teardown(document);

    expect(toggle()).toBeNull();   // Journal launcher gone
    expect(host()).toBeNull();     // body host removed
  });
});

describe('handleRouteChange — path-aware SPA reactivation (issue #70)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    document.getElementById(HOST_ID)?.remove();
    document.querySelector('.fp-panel-toggle')?.remove();
    await freshDb();
    vi.stubGlobal('chrome', {
      runtime: { id: 'ext-test', onMessage: { addListener: vi.fn() }, sendMessage: vi.fn() },
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) } },
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('routing INTO /questionbank/* activates (mounts the UI)', async () => {
    // Simulate the post-login SPA route: the document started elsewhere; the app pushes to the bank.
    setLocation(STUDENT_HOST, '/login');
    handleRouteChange(document);
    expect(toggle()).toBeNull();   // not a QB page → nothing mounted

    setLocation(STUDENT_HOST, '/questionbank/results');
    handleRouteChange(document);
    await vi.waitFor(() => expect(toggle()).not.toBeNull());   // entered a QB page → activated
    expect(host()).not.toBeNull();
  });

  it('routing AWAY from a QB page to /dashboard tears the UI down', async () => {
    setLocation(STUDENT_HOST, '/questionbank/results');
    handleRouteChange(document);
    await vi.waitFor(() => expect(toggle()).not.toBeNull());

    setLocation(STUDENT_HOST, '/dashboard');
    handleRouteChange(document);

    await vi.waitFor(() => {
      expect(toggle()).toBeNull();   // left the bank → our UI is gone, not lingering on /dashboard
      expect(host()).toBeNull();
    });
  });

  it('re-entering a QB page after teardown does NOT double-mount (idempotent across routes)', async () => {
    setLocation(STUDENT_HOST, '/questionbank/results');
    handleRouteChange(document);
    await vi.waitFor(() => expect(toggle()).not.toBeNull());

    setLocation(STUDENT_HOST, '/dashboard');
    handleRouteChange(document);
    await vi.waitFor(() => expect(toggle()).toBeNull());

    setLocation(STUDENT_HOST, '/questionbank/search');
    handleRouteChange(document);
    await vi.waitFor(() => expect(toggle()).not.toBeNull());
    expect(document.querySelectorAll('.fp-panel-toggle')).toHaveLength(1);   // exactly one, never stacked
  });
});
