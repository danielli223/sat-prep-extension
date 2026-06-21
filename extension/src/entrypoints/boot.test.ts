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
  // Issue #70 round 2: the per-tick body of the always-on `location.href` poller. The isolated-world
  // `history.pushState` patch the first cut shipped is DEAD CODE — content scripts run in a separate
  // world and never see the page's main-world router calls, so the overlay would never activate after
  // CB's login→bank SPA route. `checkForRouteChange` instead compares `doc.location.href` (which DOES
  // reflect the page URL across worlds) against a module-level baseline. This is the testable unit; the
  // `setInterval`/`popstate` wiring lives in the under-test-skipped boot block.
  checkForRouteChange(doc: Document): void;
};
const { isQuestionBankPage, activate, teardown, handleRouteChange, checkForRouteChange } = boot;

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

describe('checkForRouteChange — poll tick RECONCILES by QB-status (issue #70, round 3)', () => {
  // WHY THIS EXISTS — and why the framing CHANGED from round 2. The first cut detected SPA navigations by
  // patching `history.pushState`/`replaceState` from the content script. Content scripts run in an
  // ISOLATED world, so that patch never sees the page's main-world router calls — the overlay would
  // silently fail to react after CB's login→bank route. Round 2 replaced it with an href POLL, but framed
  // each tick as "first call seeds a baseline, then act only when the href CHANGED since last tick." That
  // change-gating IS a bug: `/verify-overlay` caught the overlay LINGERING on /login after a QB→login
  // redirect (an expired session hitting a /questionbank bookmark — the document committed at the bank
  // URL, our UI mounted, CB then client-redirected to /login, and the URL was already /login before the
  // poller's FIRST tick). The change-gate baselines at /login, never observes a QB→login change, and never
  // tears down → the overlay lingers on /login.
  //
  // The fix this block now locks: `checkForRouteChange(doc)` RECONCILES the overlay to the CURRENT page on
  // every call, driven by QB-status vs the active state — NOT by whether the href string changed:
  //   • isQuestionBankPage(doc.location) && overlay NOT active  → activate(doc)
  //   • !isQuestionBankPage(doc.location) && overlay active     → teardown(doc)
  //   • otherwise                                               → no-op
  // Reconciling makes the poller's tick TIMING irrelevant: it tears down a lingering overlay even when its
  // FIRST observation is already the post-redirect /login URL. happy-dom cannot model CB's real redirect
  // timing; the reconcile invariant is what makes that timing not matter. The setInterval/popstate WIRING
  // is verified live by /verify-overlay. Content-free.
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
  afterEach(() => {
    // Leave the page on a QB url with the overlay torn down, so the shared module-level active flag is in
    // a known-clean state for the next test (these tests share one module instance via the static import).
    setLocation(STUDENT_HOST, '/questionbank/results');
    teardown(document);
    vi.unstubAllGlobals();
  });

  it('reconciles a FORWARD route into a QB page on (login→bank), no "baseline" tick required', async () => {
    // On /login the page is NOT a QB page and the overlay is not active → reconcile is a no-op (nothing
    // mounts). This is the post-login-redirect document state; it no longer relies on a "first tick only
    // seeds a cursor" rule — a tick at /login simply has nothing to reconcile.
    setLocation(STUDENT_HOST, '/login');
    checkForRouteChange(document);
    expect(toggle()).toBeNull();   // not a QB page, overlay inactive → nothing mounted

    // The app SPA-routes into the bank WITHOUT a fresh document load — the transition the isolated-world
    // pushState patch could never observe. The poll reconciles to the current page: it's a QB page and the
    // overlay is inactive → activate.
    setLocation(STUDENT_HOST, '/questionbank/results');
    checkForRouteChange(document);
    await vi.waitFor(() => expect(toggle()).not.toBeNull());   // overlay activates after the SPA route
    expect(host()).not.toBeNull();
  });

  it('is a NO-OP on a quiet tick while already active on a QB page (no double-mount)', async () => {
    setLocation(STUDENT_HOST, '/questionbank/results');
    checkForRouteChange(document);   // QB page, overlay inactive → activate
    await vi.waitFor(() => expect(toggle()).not.toBeNull());

    // The poller ticks continuously; a tick that finds the overlay ALREADY active on a QB page reconciles
    // to "already in the target state" → no-op. It must not re-run activation or stack a second toggle/host.
    checkForRouteChange(document);
    await vi.waitFor(() => {});   // let any stray async settle
    expect(document.querySelectorAll('.fp-panel-toggle')).toHaveLength(1);
    expect(document.querySelectorAll(`#${HOST_ID}`)).toHaveLength(1);
  });

  it('TEARS DOWN when routing back out to a non-QB page (/dashboard)', async () => {
    setLocation(STUDENT_HOST, '/questionbank/results');
    checkForRouteChange(document);   // QB page, inactive → activate
    await vi.waitFor(() => expect(toggle()).not.toBeNull());

    // SPA-route back out of the bank: the page is no longer a QB page and the overlay is active →
    // reconcile tears the UI off.
    setLocation(STUDENT_HOST, '/dashboard');
    checkForRouteChange(document);
    await vi.waitFor(() => {
      expect(toggle()).toBeNull();   // Journal launcher gone
      expect(host()).toBeNull();     // body host removed — nothing lingers on /dashboard
    });
  });
});

describe('checkForRouteChange — the /login redirect RACE regression (issue #70, round 3)', () => {
  // THE LOAD-BEARING REGRESSION. This reproduces exactly what `/verify-overlay` caught live: the page
  // loaded on a QB url (overlay mounted by the load-time handleRouteChange), the session had expired, CB
  // client-redirected to /login, and our UI LINGERED on /login. Root cause: the round-2 poll was
  // href-CHANGE-gated and seeded its baseline on its FIRST tick. The redirect committed the URL to /login
  // BEFORE that first tick, so the poller baselined at /login, never saw a QB→login change, and never tore
  // down. happy-dom can't reproduce the real redirect timing, so we put the module in the racy
  // configuration directly: a FRESH module instance (cursor un-seeded, exactly as on a real page load)
  // whose poller's FIRST EVER observation is already the post-redirect /login url. This test FAILS against
  // the change-gated code (the overlay lingers — `.fp-panel-toggle` is still present after the /login
  // tick) and PASSES only once the poll RECONCILES by QB-status, which makes the tick timing irrelevant.
  //
  // It uses its own fresh module instance (vi.resetModules + dynamic import) so `lastHref` genuinely
  // starts undefined — i.e. the poller has never ticked before, the true state on a page load. The
  // file-level killswitch/block-detect mocks still apply to the re-imported module (verified).
  let raceBoot: {
    activate(doc: Document): void | Promise<void>;
    teardown(doc: Document): void;
    checkForRouteChange(doc: Document): void;
  };
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
    // Fresh instance → its `lastHref` poll cursor is undefined, modelling a brand-new page load where the
    // poller has NOT yet ticked. This is the only way to make the FIRST poll observation be the post-
    // redirect /login url (the race) honestly, through the public API.
    vi.resetModules();
    raceBoot = (await import('./content')) as unknown as typeof raceBoot;
  });
  afterEach(() => {
    raceBoot.teardown(document);
    vi.unstubAllGlobals();
  });

  it('reconciles a lingering overlay off when a QB page redirects to /login (no baseline race)', async () => {
    // 1) Initial load lands on a QB url and our load-time mount activates the overlay — NOT via the poller
    //    (handleRouteChange/activate runs at document_idle; the poller hasn't ticked yet). Mirror that here.
    setLocation(STUDENT_HOST, '/questionbank/results');
    await raceBoot.activate(document);
    await vi.waitFor(() => expect(toggle()).not.toBeNull());   // overlay is mounted, as on the real load
    expect(host()).not.toBeNull();

    // 2) Session expired → CB CLIENT-redirects to /login. The URL is already /login when the poller takes
    //    its FIRST observation (the redirect beat the first tick — that's the race). There is deliberately
    //    NO intervening tick at the QB url: `raceBoot.checkForRouteChange` below is the poller's first call.
    setLocation(STUDENT_HOST, '/login');
    raceBoot.checkForRouteChange(document);

    // 3) Reconcile must tear the overlay down: /login is not a QB page and the overlay IS active. The
    //    change-gated code baselines at /login here (first tick) and lingers → this is the bug the test
    //    locks out. Nothing of ours may remain on /login.
    await vi.waitFor(() => {
      expect(toggle()).toBeNull();   // Journal launcher gone — no lingering UI on /login
      expect(host()).toBeNull();     // body host removed
    });
  });
});
