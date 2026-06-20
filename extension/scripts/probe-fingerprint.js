// Live structural fingerprint probe for the CB DOM-drift watchdog (#4).
//
// Run against the dev Chrome's live Question Bank tab via:
//   npm run drift:probe          (== npm run cdp -- --file scripts/probe-fingerprint.js)
// cdp-eval.mjs evaluates this file IN THE LIVE PAGE CONTEXT (Runtime.evaluate) and prints the JSON
// it returns. Because it runs in the page it CANNOT import the TS module, so the selectors below are
// restated by hand.
//
// KEEP IN SYNC WITH src/cb/fingerprint.ts SELECTORS. If you change a selector in one, change it here.
//
// BRIGHT LINE (invariant #3 / #2): this probe emits STRUCTURE ONLY — booleans (does a structure
// exist?), counts (how many?), and the selector NAMES. It reads NO question/choice/passage/rationale
// text and NEVER the bare 8-hex id (only THAT one is present, as a boolean). This is the ONLY thing
// from the live CB DOM that is safe to log/diff or ever show a model. It performs NO network calls,
// NO navigation, and NO question traversal — it reads only what the student already rendered
// (invariant #1 read-only, invariant #4 user-initiated).

(() => {
  // --- selectors (mirror src/cb/fingerprint.ts SELECTORS) ---
  const SELECTORS = {
    dialogContainer: '.cb-dialog-container',
    headerH4: 'h4',
    taxonomyTable: 'table.cb-table',
    taxonomyRows: 'table.cb-table tr',
    stemContent: '.question-content',
    answerChoices: '.answer-choices ul > li',
    rationale: '.rationale',
    resultsTable: 'table.cb-table-react',
    resultsBodyRows: 'tbody tr',
    resultsIdColumn: '.id-column',
  };
  // Presence-only regexes (mirror reader.ts ID_RE / list-reader.ts ROW_ID_RE). We .test() them —
  // never read the captured group — so no id value can enter the result.
  const ID_RE = /Question ID:\s*([0-9a-f]{8})/i;
  const ROW_ID_RE = /(?<![0-9a-f])([0-9a-f]{8})(?![0-9a-f])/i;

  // --- single open question (if a question modal is rendered) ---
  function fingerprintQuestion(root) {
    if (!root) return null;
    const header = root.querySelector(SELECTORS.headerH4);
    const taxRows = Array.from(root.querySelectorAll(SELECTORS.taxonomyRows));
    const dataRow = taxRows.find((r) => r.querySelector('td')) ?? taxRows[taxRows.length - 1];
    return {
      hasDialogContainer: root.matches(SELECTORS.dialogContainer),
      hasHeaderH4: !!header,
      hasQuestionId: ID_RE.test((header && header.textContent) || ''),
      hasTaxonomyTable: !!root.querySelector(SELECTORS.taxonomyTable),
      taxonomyDataCellCount: dataRow ? dataRow.querySelectorAll('td').length : 0,
      hasStemNode: !!root.querySelector(SELECTORS.stemContent),
      answerChoiceCount: root.querySelectorAll(SELECTORS.answerChoices).length,
      hasRationale: !!root.querySelector(SELECTORS.rationale),
    };
  }

  // --- results list (if the table is rendered) ---
  function fingerprintList(root) {
    if (!root) return null;
    const table = root.matches(SELECTORS.resultsTable)
      ? root
      : root.querySelector(SELECTORS.resultsTable);
    const bodyRows = table ? Array.from(table.querySelectorAll(SELECTORS.resultsBodyRows)) : [];
    return {
      hasResultsTable: !!table,
      bodyRowCount: bodyRows.length,
      idBearingRowCount: bodyRows.filter((node) => {
        const cell = node.querySelector(SELECTORS.resultsIdColumn);
        return ROW_ID_RE.test((cell && cell.textContent) || '');
      }).length,
    };
  }

  const questionRoot = document.querySelector(SELECTORS.dialogContainer);
  const listRoot = document.querySelector('.results-page') || document.querySelector(SELECTORS.resultsTable);

  return {
    probedAt: new Date().toISOString(),
    url: location.origin + location.pathname, // origin + path only — no query (could carry filters/ids)
    question: fingerprintQuestion(questionRoot), // null when no question modal is open
    list: fingerprintList(listRoot),             // null when the results table is not rendered
  };
})()
