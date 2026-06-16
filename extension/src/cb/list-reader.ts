// ISOLATED CB-DOM KNOWLEDGE (sibling of reader.ts/observer.ts). The only place that knows the
// shape of CB's *results list*. Pure read: returns each row's question ID + its row node so the
// badger can attach chips without itself touching CB's HTML. No content is read or returned —
// only IDs + the node to anchor a chip on.
export interface ListRow { id: string; node: Element; }

// Live CB results list (spike 2026-06-15): table.cb-table-react, each row's id is the BARE 8-hex in
// td.id-column (no "Question ID:" prefix — that is only in the modal's <h4>). node is the <tr> so the
// badger can attach a chip without touching CB's HTML. Only the id is read; no question content.
const ROW_ID_RE = /^[0-9a-f]{8}$/i;

export function readListQuestionIds(listRoot: Element): ListRow[] {
  const rows: ListRow[] = [];
  for (const node of listRoot.querySelectorAll('table.cb-table-react tbody tr')) {
    const id = node.querySelector('.id-column')?.textContent?.trim() ?? '';
    if (ROW_ID_RE.test(id)) rows.push({ id, node });
  }
  return rows;
}
