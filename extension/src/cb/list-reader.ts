// ISOLATED CB-DOM KNOWLEDGE (sibling of reader.ts/observer.ts). The only place that knows the
// shape of CB's *results list*. Pure read: returns each row's question ID + its row node so the
// badger can attach chips without itself touching CB's HTML. No content is read or returned —
// only IDs + the node to anchor a chip on + the row's difficulty TIER (taxonomy metadata, the same
// class of non-content field reader.ts reads — never a stem/choice/passage). Issue #25: the nav-grid
// colors its cells by this difficulty; empty string when the row has no .difficulty-column cell.
export interface ListRow { id: string; node: Element; difficulty: string; }

// Live CB results list (spike 2026-06-15): table.cb-table-react, each row's id is the BARE 8-hex in
// td.id-column (no "Question ID:" prefix — that is only in the modal's <h4>). node is the <tr> so the
// badger can attach a chip without touching CB's HTML. Only the id is read; no question content.
// Match the 8-hex token WITHIN the cell text (not the whole trimmed string) so that the badger's own
// state chip — which the badger appends inside .id-column — never pollutes the id read on a re-badge.
// Bounded by non-hex (or string edge) on both sides so it can't grab a slice of a longer hex run, but
// tolerates a directly-concatenated chip label (e.g. "ab12cd34✓ done", "ab12cd34new").
const ROW_ID_RE = /(?<![0-9a-f])([0-9a-f]{8})(?![0-9a-f])/i;

export function readListQuestionIds(listRoot: Element): ListRow[] {
  // listRoot may BE the table.cb-table-react (the live container findResultsList returns) or a wrapper
  // that contains it. Self-match the listRoot first (:scope), then any descendant table — so the same
  // reader works whether the badger anchors on the bare table or an enclosing element.
  const table = listRoot.matches('table.cb-table-react')
    ? listRoot
    : listRoot.querySelector('table.cb-table-react');
  if (!table) return [];
  const rows: ListRow[] = [];
  for (const node of table.querySelectorAll('tbody tr')) {
    const cellText = node.querySelector('.id-column')?.textContent ?? '';
    const id = ROW_ID_RE.exec(cellText)?.[1] ?? '';
    // Difficulty TIER only (taxonomy, never content); '' when the cell is absent.
    const difficulty = node.querySelector('.difficulty-column')?.textContent?.trim() ?? '';
    if (id) rows.push({ id, node, difficulty });
  }
  return rows;
}
