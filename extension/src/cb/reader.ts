// ISOLATED CB-DOM KNOWLEDGE. The only place (with observer.ts) that knows CB's HTML shape.
// Pure read: returns a clean view-model. Question text is for in-RAM spotlighting only — never stored.
// Selectors calibrated against the LIVE Educator Question Bank DOM (DOM-contract spike, 2026-06-15).

// Neutral math AST (issue #35). CB renders choice math via MathJax as TWO layers: a garbled visual
// glyph layer and a SEMANTIC MathML <math> tree. We read the semantic tree into this structure-only
// AST (no CB markup, no attributes — data only) so the renderer can emit OUR OWN safe tags. RAM-only:
// threaded through the view-model and rendered, never stored, never sent to a model.
export type MathNode =
  | { kind: 'text'; value: string }
  | { kind: 'row'; items: MathNode[] }
  | { kind: 'sup'; base: MathNode; sup: MathNode }
  | { kind: 'sub'; base: MathNode; sub: MathNode }
  | { kind: 'subsup'; base: MathNode; sub: MathNode; sup: MathNode }
  | { kind: 'frac'; num: MathNode; den: MathNode }
  | { kind: 'sqrt'; radicand: MathNode };

export interface Choice { letter: string; text: string; imgSrc?: string; math?: MathNode; }
export interface QuestionView {
  id: string;
  section: string; domain: string; skill: string; difficulty: string;
  stem: string;                        // RAM-only (spotlight + dedup); never persisted
  choices: Choice[];                   // MC only; empty for grid-in (student-produced response)
  correctAnswer: string | null;        // present only once CB's rationale is revealed
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

const collapse = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

// Parse a single MathML element into a MathNode. Match by `localName` (namespace-safe: `tagName`
// uppercases in the HTML namespace but not in MathML, so it is unreliable across happy-dom + real
// browsers). Unknown containers fall through to `row` so we degrade gracefully on CB markup changes.
function parseMathEl(el: Element): MathNode | null {
  const kids = [...el.children];
  switch (el.localName) {
    case 'mn': case 'mi': case 'mo': case 'mtext':
      return { kind: 'text', value: collapse(el.textContent) };
    case 'mfrac':
      return { kind: 'frac', num: parseMathEl(kids[0]!) ?? row([]), den: parseMathEl(kids[1]!) ?? row([]) };
    case 'msup':
      return { kind: 'sup', base: parseMathEl(kids[0]!) ?? row([]), sup: parseMathEl(kids[1]!) ?? row([]) };
    case 'msub':
      return { kind: 'sub', base: parseMathEl(kids[0]!) ?? row([]), sub: parseMathEl(kids[1]!) ?? row([]) };
    case 'msubsup':
      return {
        kind: 'subsup',
        base: parseMathEl(kids[0]!) ?? row([]),
        sub: parseMathEl(kids[1]!) ?? row([]),
        sup: parseMathEl(kids[2]!) ?? row([]),
      };
    case 'msqrt':
      return { kind: 'sqrt', radicand: row(parseChildren(kids)) };
    case 'mroot':
      return { kind: 'sqrt', radicand: parseMathEl(kids[0]!) ?? row([]) };
    // Raw TeX must never enter the AST.
    case 'annotation': case 'annotation-xml':
      return null;
    // mrow, math, semantics, mstyle, mpadded, and any unknown container → a row of parsed children.
    default:
      return row(parseChildren(kids));
  }
}

// Collapse a list to a single node when there's exactly one, else wrap in a row.
function row(items: MathNode[]): MathNode {
  return items.length === 1 ? items[0]! : { kind: 'row', items };
}

function parseChildren(els: Element[]): MathNode[] {
  return els.map(parseMathEl).filter((n): n is MathNode => n !== null);
}

// Build a choice's overall math AST by walking the cleaned <li>'s child NODES: text nodes become
// `text`, <math> elements are parsed semantically, and other wrappers recurse. Returns undefined when
// the <li> carries no <math> at all (regression: plain-text / image choices keep math undefined).
function readChoiceMath(li: Element): MathNode | undefined {
  if (!li.querySelector('math')) return undefined;
  // Drop the MathJax visual glyph layer (its textContent is garbled) before walking, so only the
  // semantic <math> contributes — never the visual "v150"/glyph noise.
  const clone = li.cloneNode(true) as Element;
  clone.querySelectorAll('mjx-container').forEach((n) => n.remove());
  const items = walkNodes(clone);
  if (items.length === 0) return undefined;
  return row(items);
}

function walkNodes(parent: Node): MathNode[] {
  const out: MathNode[] = [];
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 3) {                         // text node
      const value = collapse(node.textContent);
      if (value) out.push({ kind: 'text', value });
    } else if (node.nodeType === 1) {
      const el = node as Element;
      if (el.localName === 'math') {
        const parsed = parseMathEl(el);
        if (parsed) out.push(parsed);
      } else {
        out.push(...walkNodes(el));                    // recurse through wrappers
      }
    }
  }
  return out;
}

// Cleaned flattened text for a11y/fallback: drop the MathJax visual glyph layer (mjx-container, whose
// textContent is garbled) and style/script/annotation noise, then read what's left. Keeps the garbled
// "v"/glyph noise and raw TeX out of the fallback string.
function readChoiceText(li: Element): string {
  const clone = li.cloneNode(true) as Element;
  clone.querySelectorAll('mjx-container, style, script, annotation, annotation-xml').forEach((n) => n.remove());
  return collapse(clone.textContent);
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
  // Some CB Math questions render choices as images (e.g. complex math expressions) — textContent
  // is empty in that case, so fall back to capturing the <img> src for overlay rendering.
  const choices: Choice[] = [...root.querySelectorAll('.answer-choices ul > li')].map((li, i) => {
    const letter = 'ABCD'[i] ?? '';
    // MathJax/MathML choice (issue #35): read the SEMANTIC <math> into the AST and use a CLEANED
    // textContent (visual glyph layer + TeX stripped) for the a11y/fallback string.
    const math = readChoiceMath(li);
    if (math) return { letter, text: readChoiceText(li), math };
    // No <math> → keep today's behavior exactly: image-choice imgSrc fallback, else plain text.
    const text = (li.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) {
      const img = li.querySelector('img');
      if (img?.src) return { letter, text: img.alt || '', imgSrc: img.src };
    }
    return { letter, text };
  });

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
    choices,
    correctAnswer,
  };
}
