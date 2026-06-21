// CONTENT-FREE sibling of reader.ts / list-reader.ts (the CB DOM-drift watchdog, #4).
//
// reader.ts returns TEXT (RAM-only, never logged); `fingerprint.ts` is the part that IS safe to
// log/diff/persist and the only thing that may reach a model. It projects the CB question DOM down
// to STRUCTURE ONLY — booleans (does a structure exist?), counts (how many?), and the stable
// selector-NAMES we chose. It NEVER reads or echoes any scraped page text: no question stem, choice,
// rationale, taxonomy value, nor even the bare 8-hex question id. That is the bright line that lets a
// drift trace be logged without ever carrying CB content (invariant #3 / #2).
//
// It mirrors EXACTLY the selectors reader.ts/list-reader.ts depend on, so that when CB renames or
// removes one, the corresponding boolean flips false / count drops to 0 — that is the drift signal.
//
// KEEP IN SYNC WITH scripts/probe-fingerprint.js (the live-page restatement of these same selectors).

// The exact selectors reader.ts / list-reader.ts depend on. Centralised so the fingerprint, the
// readers' shape knowledge, and the live probe can be diffed against one source of truth. Only
// selector NAMES live here — never page content.
export const SELECTORS = {
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
} as const;

// Mirror reader.ts ID_RE: the id token is present iff the <h4> text matches. We test for presence
// ONLY — the captured group is never read out, so the id value never enters the fingerprint.
const ID_RE = /Question ID:\s*([0-9a-f]{8})/i;
// Mirror list-reader.ts ROW_ID_RE: an 8-hex token bounded by non-hex, tested for presence only.
const ROW_ID_RE = /(?<![0-9a-f])([0-9a-f]{8})(?![0-9a-f])/i;

// Structure-only fingerprint of a single question. `root` is the node reader.readQuestion is handed
// (CB's div.cb-dialog-container). Every returned value is a boolean, a number, or a selector-name
// string — never any scraped text.
export function fingerprint(root: Element): {
  hasDialogContainer: boolean;
  hasHeaderH4: boolean;
  hasQuestionId: boolean;
  hasTaxonomyTable: boolean;
  taxonomyDataCellCount: number;
  hasStemNode: boolean;
  answerChoiceCount: number;
  hasRationale: boolean;
} {
  // True when `root` IS the dialog container (the element the reader expects); flips false if CB
  // renames it (e.g. .cb-dialog-wrapper), exactly as readQuestion would then receive a wrong node.
  const hasDialogContainer = root.matches(SELECTORS.dialogContainer);

  // The id lives in the header <h4> ("Question ID: ……"). Report only THAT the <h4> exists and THAT
  // an 8-hex id token is present — never the id itself.
  const header = root.querySelector(SELECTORS.headerH4);
  const hasHeaderH4 = !!header;
  const hasQuestionId = ID_RE.test(header?.textContent ?? '');

  // Taxonomy meta table + the data row (the <tr> with <td>s — reader picks rows.find(td) ?? last).
  const taxTable = root.querySelector(SELECTORS.taxonomyTable);
  const hasTaxonomyTable = !!taxTable;
  const taxRows = [...root.querySelectorAll(SELECTORS.taxonomyRows)];
  const dataRow = taxRows.find((r) => r.querySelector('td')) ?? taxRows[taxRows.length - 1];
  const taxonomyDataCellCount = dataRow ? dataRow.querySelectorAll('td').length : 0;

  // Stem container exists (reader prefers .question inside .question-content). Presence only.
  const stemContent = root.querySelector(SELECTORS.stemContent);
  const hasStemNode = !!stemContent;

  // Answer choices: count the <li> under .answer-choices ul (4 for MC / image-choice, 0 for grid-in,
  // 0 when .answer-choices is renamed). Counted, never read.
  const answerChoiceCount = root.querySelectorAll(SELECTORS.answerChoices).length;

  // Revealed rationale exists (false pre-reveal, before CB injects it). Presence only.
  const hasRationale = !!root.querySelector(SELECTORS.rationale);

  return {
    hasDialogContainer,
    hasHeaderH4,
    hasQuestionId,
    hasTaxonomyTable,
    taxonomyDataCellCount,
    hasStemNode,
    answerChoiceCount,
    hasRationale,
  };
}

// Structure-only fingerprint of the results list. `root` is the node list-reader.readListQuestionIds
// is handed (the table.cb-table-react itself or a wrapper such as .results-page). Counts only — no row
// id is ever read out.
export function fingerprintList(root: Element): {
  hasResultsTable: boolean;
  bodyRowCount: number;
  idBearingRowCount: number;
} {
  // Mirror list-reader's lookup: self-match the root or find a descendant table.cb-table-react.
  const table = root.matches(SELECTORS.resultsTable)
    ? root
    : root.querySelector(SELECTORS.resultsTable);
  const hasResultsTable = !!table;

  const bodyRows = table ? [...table.querySelectorAll(SELECTORS.resultsBodyRows)] : [];
  const bodyRowCount = bodyRows.length;

  // Rows whose .id-column carries an 8-hex id (the loading row's empty .id-column is excluded).
  // Test presence only — the id is never captured into the fingerprint.
  const idBearingRowCount = bodyRows.filter((node) =>
    ROW_ID_RE.test(node.querySelector(SELECTORS.resultsIdColumn)?.textContent ?? ''),
  ).length;

  return { hasResultsTable, bodyRowCount, idBearingRowCount };
}
