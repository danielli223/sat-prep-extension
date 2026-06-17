// ISOLATED CB-DOM KNOWLEDGE. The only place (with observer.ts) that knows CB's HTML shape.
// Pure read: returns a clean view-model. Question text is for in-RAM spotlighting only — never stored.
// Selectors calibrated against the LIVE Educator Question Bank DOM (DOM-contract spike, 2026-06-15).
export interface Choice { letter: string; text: string; }
export interface QuestionView {
  id: string;
  section: string; domain: string; skill: string; difficulty: string;
  stem: string;                        // RAM-only (spotlight + dedup); never persisted
  stemHtml: string;                    // RAM-only; sanitized stem markup for rendering (tables etc.)
  choices: Choice[];                   // MC only; empty for grid-in (student-produced response)
  correctAnswer: string | null;        // present only once CB's rationale is revealed
  explanation: string | null;          // RAM-only; never persisted
  explanationHtml: string;             // RAM-only; sanitized rationale markup for rendering (CB's layout)
}

// CB question IDs are 8 hex chars. Bounding the capture to exactly 8 stops adjacent text (e.g. a
// "Copy" button rendered next to the heading) from leaking trailing hex digits into the id.
const ID_RE = /Question ID:\s*([0-9a-f]{8})/i;
const ANS_RE = /Correct Answer:\s*(.+)/i;

// Returns the element holding the actual question stem. CB nests the stem in .question inside
// .question-content — but that container ALSO holds CB's own "Math" / "Difficulty: Hard" <h5> chrome,
// which flattened into the stem as a "MathDifficulty: Hard" leak (live 2026-06-16). Prefer .question;
// only if it's absent fall back to the whole container (callers then strip the label <h5>s).
function stemRoot(root: Element): Element | null {
  const qc = root.querySelector('.question-content');
  if (!qc) return null;
  return qc.querySelector('.question') ?? qc;
}

// CB renders the question stem with embedded MathJax/SVG, which carries a <style> block whose CSS
// text leaks into textContent ("*{stroke-linecap:butt;…}", spike 2026-06-15). Clone, drop style/script
// and CB's <h5> chrome, then read text. RAM-only (spotlight + observer dedup) — never stored.
function readStem(root: Element): string {
  const src = stemRoot(root);
  if (!src) return '';
  const clone = src.cloneNode(true) as Element;
  clone.querySelectorAll('style, script, h5').forEach((n) => n.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

// Renders CB's stem markup as a STRICT ALLOWLIST of structural tags so tables paint as real tables
// (a table-bearing stem flattened to a run-on text blob before this; live 2026-06-16). This is the
// ONLY place CB HTML is rendered un-escaped, so the allowlist IS the XSS boundary (not esc()): every
// tag outside STEM_TAGS is dropped (DROP_TAGS) or unwrapped, ALL attributes are stripped except a
// digits-only colspan/rowspan, and MathJax/SVG collapse to their text. No script, style, handler,
// href, src or inline style can survive. RAM-only — never persisted.
const STEM_TAGS = new Set(['TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'CAPTION', 'COLGROUP',
  'COL', 'P', 'DIV', 'SPAN', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'SUB', 'SUP', 'UL', 'OL', 'LI']);
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'BASE', 'IFRAME', 'OBJECT', 'EMBED',
  'FORM', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'NOSCRIPT', 'TEMPLATE', 'AUDIO', 'VIDEO', 'SOURCE',
  'IMG', 'H5']);
const MATH_TAGS = new Set(['MJX-CONTAINER', 'MATH', 'SVG']);
const KEEP_ATTRS = ['colspan', 'rowspan'];

function sanitizeInto(node: Node, out: Element, doc: Document): void {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 3 /* text */) { out.appendChild(doc.createTextNode(child.textContent ?? '')); continue; }
    if (child.nodeType !== 1 /* element */) continue;
    const el = child as Element;
    const tag = el.tagName.toUpperCase();
    if (DROP_TAGS.has(tag)) continue;                                  // scripts, styles, media, CB <h5> chrome
    if (MATH_TAGS.has(tag)) {                                          // MathJax/SVG → its plain value
      // MathJax containers carry an inner <style> block whose CSS leaks into textContent
      // ("mjx{}…", spike 2026-06-15); drop it before reading the rendered value.
      const m = el.cloneNode(true) as Element;
      m.querySelectorAll('style, script').forEach((n) => n.remove());
      out.appendChild(doc.createTextNode((m.textContent ?? '').replace(/\s+/g, ' ')));
      continue;
    }
    if (STEM_TAGS.has(tag)) {
      const clean = doc.createElement(tag.toLowerCase());
      for (const name of KEEP_ATTRS) {
        const v = el.getAttribute(name);
        if (v && /^\d+$/.test(v)) clean.setAttribute(name, v);        // digits only — no value injection
      }
      sanitizeInto(el, clean, doc);
      out.appendChild(clean);
      continue;
    }
    sanitizeInto(el, out, doc);                                       // unknown tag (e.g. <figure>, <a>): unwrap, keep children
  }
}

function readStemHtml(root: Element): string {
  const src = stemRoot(root);
  if (!src) return '';
  const doc = root.ownerDocument!;
  const out = doc.createElement('div');
  sanitizeInto(src, out, doc);   // h5 chrome is in DROP_TAGS, so the fallback (src === .question-content) is clean too
  return out.innerHTML.trim();
}

// Renders CB's rationale with the SAME sanitized allowlist as the stem, so the explanation panel
// mirrors CB's layout (paragraphs, tables, per-choice breakdown) instead of one flat escaped run.
// CB bolds its "Correct Answer: X" line with a CSS class, which the allowlist strips with every other
// attribute — so re-bold the smallest element carrying that line with an allowlisted <strong> (built
// here, on our already-sanitized DOM) so the answer still reads as a heading like CB shows it. RAM-only.
function readExplanationHtml(rationale: Element): string {
  const doc = rationale.ownerDocument!;
  const out = doc.createElement('div');
  sanitizeInto(rationale, out, doc);
  const answerEl = [...out.querySelectorAll('*')]
    .filter((el) => /^\s*Correct Answer:/i.test(el.textContent ?? ''))
    .sort((a, b) => (a.textContent?.length ?? 0) - (b.textContent?.length ?? 0))[0];
  if (answerEl && !answerEl.querySelector('strong')) {
    const strong = doc.createElement('strong');
    while (answerEl.firstChild) strong.appendChild(answerEl.firstChild);
    answerEl.appendChild(strong);
  }
  return out.innerHTML.trim();
}

// `root` is CB's div.cb-dialog-container (see observer.ts) — the element that actually holds the
// question. The [role="dialog"] node itself does NOT contain the question content.
export function readQuestion(root: Element): QuestionView | null {
  // The id lives in the dialog header's <h4> ("Question ID: ab12cd34"). Read it there, not from the
  // whole modal's text, so a neighbouring control can't corrupt it.
  const idMatch = (root.querySelector('h4')?.textContent ?? '').match(ID_RE);
  if (!idMatch) return null;

  // Taxonomy: the modal's own meta table (table.cb-table). Pick the data row (the one with <td>s),
  // so a thead/tbody split can't shift the indices: [Assessment, Section, Domain, Skill, Difficulty].
  const rows = [...root.querySelectorAll('table.cb-table tr')];
  const dataRow = rows.find((r) => r.querySelector('td')) ?? rows[rows.length - 1];
  const cells = dataRow ? [...dataRow.querySelectorAll('td')] : [];
  const cell = (i: number) => cells[i]?.textContent?.trim() ?? '';

  // Choices: <li> in .answer-choices ul. The A–D letter is CSS-generated (absent from the text),
  // so it is derived from the list index. Present in the DOM whether or not the answer is revealed.
  const choices: Choice[] = [...root.querySelectorAll('.answer-choices ul > li')].map((li, i) => ({
    letter: 'ABCD'[i] ?? '',
    text: (li.textContent ?? '').trim(),
  }));

  // Correct answer: the "Correct Answer: X" element inside .rationale — only in the DOM once the
  // student reveals "Show correct answer and explanation". Read the SMALLEST matching element so the
  // explanation text can't bleed into the captured answer.
  const rationale = root.querySelector('.rationale');
  let correctAnswer: string | null = null;
  if (rationale) {
    const caEl = [...rationale.querySelectorAll('*')]
      .filter((e) => /Correct Answer:/i.test(e.textContent ?? ''))
      .sort((a, b) => (a.textContent?.length ?? 0) - (b.textContent?.length ?? 0))[0];
    const m = caEl?.textContent?.match(ANS_RE);
    correctAnswer = m ? m[1]!.trim() : null;
  }

  return {
    id: idMatch[1]!,
    section: cell(1), domain: cell(2), skill: cell(3), difficulty: cell(4),
    stem: readStem(root),
    stemHtml: readStemHtml(root),
    choices,
    correctAnswer,
    explanation: (rationale?.textContent ?? '').trim() || null,
    explanationHtml: rationale ? readExplanationHtml(rationale) : '',
  };
}
