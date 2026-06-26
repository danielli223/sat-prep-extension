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

// Ordered inline content for a choice that mixes images and text — e.g. CB renders each math
// expression as an inline <img class="math-img"> (a self-contained data:image/png) and pairs two of
// them with a literal connective: "[img] and [img]". RAM-only, like the rest of the view-model.
export type ChoicePart =
  | { kind: 'text'; value: string }
  | { kind: 'img'; src: string; alt: string };

export interface Choice { letter: string; text: string; imgSrc?: string; math?: MathNode; parts?: ChoicePart[]; }
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
  return collapse(clone.textContent);
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
    // Fixed-arity elements index specific children. FAIL SAFE (invariant #6): if CB emits one with
    // FEWER children than the form requires, do NOT index past the end (parseMathEl(undefined) would
    // crash, suppressing the whole overlay). Degrade to a `row` of the children that ARE present so the
    // readable leaves survive. Well-formed inputs take the structured branch and render unchanged.
    case 'mfrac':
      if (kids.length < 2) return row(parseChildren(kids));
      return { kind: 'frac', num: parseMathEl(kids[0]!) ?? row([]), den: parseMathEl(kids[1]!) ?? row([]) };
    case 'msup':
      if (kids.length < 2) return row(parseChildren(kids));
      return { kind: 'sup', base: parseMathEl(kids[0]!) ?? row([]), sup: parseMathEl(kids[1]!) ?? row([]) };
    case 'msub':
      if (kids.length < 2) return row(parseChildren(kids));
      return { kind: 'sub', base: parseMathEl(kids[0]!) ?? row([]), sub: parseMathEl(kids[1]!) ?? row([]) };
    case 'msubsup':
      if (kids.length < 3) return row(parseChildren(kids));
      return {
        kind: 'subsup',
        base: parseMathEl(kids[0]!) ?? row([]),
        sub: parseMathEl(kids[1]!) ?? row([]),
        sup: parseMathEl(kids[2]!) ?? row([]),
      };
    case 'msqrt':
      return { kind: 'sqrt', radicand: row(parseChildren(kids)) };
    case 'mroot':
      if (kids.length < 1) return row([]);
      return { kind: 'sqrt', radicand: parseMathEl(kids[0]!) ?? row([]) };
    // <mfenced> carries its fences in ATTRIBUTES, not child elements: `open`/`close` default to round
    // parens, `separators` to a comma. The default branch walks only child ELEMENTS, so it silently
    // dropped the parens (issue #80). Emit open + children (interleaved with separators) + close as
    // text/row — no new MathNode kind needed. parseChildren recurses, so nested <mfenced> just works.
    case 'mfenced': {
      // getAttribute returns null when ABSENT → fall back to the MathML defaults. An explicit open=""
      // is legal and means "no fence", so we emit a text node only when the string is non-empty.
      const open = el.getAttribute('open') ?? '(';
      const close = el.getAttribute('close') ?? ')';
      // MathML ignores whitespace in `separators`; empty/absent degrades to a comma.
      const seps = (el.getAttribute('separators') ?? ',').replace(/\s+/g, '') || ',';
      const items = parseChildren(kids);
      const out: MathNode[] = [];
      if (open) out.push({ kind: 'text', value: open });
      items.forEach((node, i) => {
        // Separator for the gap BEFORE child i: spec consumes the string char-by-char with the last
        // char repeating; exotic separator strings degrade to this last-char rule. FAIL SAFE: never
        // index past the end (invariant #6).
        if (i > 0) out.push({ kind: 'text', value: seps[Math.min(i - 1, seps.length - 1)]! });
        out.push(node);
      });
      if (close) out.push({ kind: 'text', value: close });
      return row(out);
    }
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

// Collapse a TEXT NODE's whitespace for the math AST: internal whitespace runs → a single space, but
// PRESERVE a single leading/trailing space when present (issue #85). Unlike `collapse`, we do NOT trim —
// trimming each interleaved prose node would jam a word against the adjacent inline number ("In1997",
// "9,000subscribers"). An all-whitespace node collapses to a single " " here; callers skip those.
const collapseInline = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ');

// Build a choice's math AST from the SEMANTIC MathML — INTERLEAVED with any surrounding prose (issue
// #85). CB renders choice math via MathJax v3 as TWO layers in the same <li>: a VISUAL SVG glyph layer
// (<svg>/<mjx-math> inside <mjx-container>), and the SEMANTIC <math> inside an <mjx-assistive-mml> that
// MathJax nests as a CHILD of that <mjx-container> (verified live over CDP 2026-06-25: removing
// <mjx-container> deletes the nested <math> with it). For a MIXED prose+math choice (a full sentence
// with inline <math> numbers), capturing only the <math> nodes DROPPED the interleaved prose and jammed
// the inline numbers together ("19979,000"). So we walk the <li>'s descendant nodes IN DOCUMENT ORDER:
//   - TEXT node → a { kind: 'text' } node (whitespace collapsed but boundary spaces preserved); an
//     all-whitespace node is skipped so pure-expression choices gain no stray nodes.
//   - SEMANTIC <math> → parseMathEl (which already recurses); we do not descend into it further.
//   - the VISUAL glyph layer (localName svg / mjx-math) → SKIPPED entirely (its text is garbled); we
//     never descend into it, which keeps the garble out of the AST.
//   - any OTHER element (p, span, mjx-container, mjx-assistive-mml, …) → descend into its children;
//     descending through <mjx-container> is how we reach the nested <mjx-assistive-mml> > <math>.
// Returns undefined unless at least one <math> element was found, so a plain-text / image / inline-SVG
// choice still falls through to the parts/image/text paths in readQuestion. A pure single-expression
// choice yields exactly the one math node (byte-for-byte as before), preserving the #35 behaviour.
function readChoiceMath(li: Element): MathNode | undefined {
  const items: MathNode[] = [];
  let sawMath = false;
  const walk = (node: Node) => {
    for (const n of Array.from(node.childNodes)) {
      if (n.nodeType === 3) {
        const value = collapseInline(n.textContent);
        if (value.trim()) items.push({ kind: 'text', value });   // skip all-whitespace nodes
      } else if (n.nodeType === 1) {
        const el = n as Element;
        const name = el.localName;
        if (name === 'math') {
          const parsed = parseMathEl(el);
          if (parsed) { items.push(parsed); sawMath = true; }
        } else if (name === 'svg' || name === 'mjx-math') {
          // CB's garbled MathJax visual glyph layer — never read, never descend.
        } else {
          walk(el);   // descend (p / span / mjx-container / mjx-assistive-mml / …)
        }
      }
    }
  };
  walk(li);
  if (!sawMath) return undefined;   // only treat the choice as "math" when it actually carries a <math>
  return row(items);
}

// Cleaned flattened text for a11y/fallback: drop the MathJax visual glyph layer (mjx-container, whose
// textContent is garbled) and style/script/annotation noise, then read what's left. Keeps the garbled
// "v"/glyph noise and raw TeX out of the fallback string.
function readChoiceText(li: Element): string {
  const clone = li.cloneNode(true) as Element;
  clone.querySelectorAll('mjx-container, style, script, annotation, annotation-xml').forEach((n) => n.remove());
  return collapse(clone.textContent);
}

// Image-based multi-part choice reader. CB renders each math expression as an inline
// <img class="math-img"> (a self-contained data:image/png) and joins paired expressions with a literal
// connective: "[img] and [img]". Walk the choice content IN ORDER, collecting img parts (src + alt) and
// the connective text between them, so the overlay can render every image. Returns undefined when the
// choice is NOT a multi-part image choice — no <img> at all, or a single bare image with no surrounding
// text (that stays on the simpler imgSrc path, so #39's single-image behaviour is unchanged).
function readChoiceParts(li: Element): ChoicePart[] | undefined {
  if (!li.querySelector('img')) return undefined;
  const clone = li.cloneNode(true) as Element;
  clone.querySelectorAll('style, script, title, desc').forEach((n) => n.remove());   // mirror text hygiene (#36)
  const root = clone.querySelector('p') ?? clone;
  const parts: ChoicePart[] = [];
  const walk = (node: Node) => {
    for (const n of Array.from(node.childNodes)) {
      if (n.nodeType === 3) {
        const value = collapse(n.textContent);
        if (value) parts.push({ kind: 'text', value });
      } else if (n.nodeType === 1) {
        const el = n as Element;
        if (el.localName === 'img') {
          const src = el.getAttribute('src') ?? '';
          if (src) parts.push({ kind: 'img', src, alt: collapse(el.getAttribute('alt')) });
        } else {
          walk(el);                                       // descend through span.math_expression wrappers
        }
      }
    }
  };
  walk(root);
  if (parts.filter((p) => p.kind === 'img').length === 0) return undefined;   // no usable image
  if (parts.length < 2) return undefined;                                     // lone image → imgSrc path
  return parts;
}

// Readable RAM-only fallback string for a parts choice: the connective text plus each image's alt, in
// order (e.g. "p equals 1 and p equals 4"). For a11y / observer dedup; never persisted.
function partsText(parts: ChoicePart[]): string {
  return collapse(parts.map((p) => (p.kind === 'img' ? p.alt : p.value)).join(' '));
}

// Some CB Math choices are inline <svg> parabola graphs with no text/<img> (#36, #82). Serialize the
// <svg> to a self-contained data: URL the overlay can render as an inert <img>. Clone, drop <script>
// nodes (defense in depth — an img-loaded SVG won't run scripts anyway), ensure the xmlns is present (a
// standalone data: URL SVG needs it), then percent-encode. Pure in-RAM serialization — never fetched.
// Takes the specific graph <svg> so a #82 choice (which ALSO holds a11y-prose siblings) serializes only
// the real graph, not the whole <li>; passing no svg falls back to the first <svg> under the element.
function serializeSvgChoice(elOrSvg: Element): string | null {
  const svg = elOrSvg.localName === 'svg' ? elOrSvg : elOrSvg.querySelector('svg');
  if (!svg) return null;
  const clone = svg.cloneNode(true) as Element;
  clone.querySelectorAll('script').forEach((n) => n.remove());
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const str = typeof XMLSerializer !== 'undefined'
    ? new XMLSerializer().serializeToString(clone)
    : clone.outerHTML;
  return `data:image/svg+xml,${encodeURIComponent(str)}`;
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

  // Choices: the TOP-LEVEL <li> of the first/outer <ul> under .answer-choices. The A–D letter is
  // CSS-generated (absent from the text), so it is derived from the list index. Present in the DOM
  // whether or not the answer is revealed. Some CB Math questions render choices as images (e.g.
  // complex math expressions) — textContent is empty in that case, so fall back to capturing the
  // <img> src for overlay rendering. Mirror readStem's hygiene: clone the <li> and drop style/script
  // and SVG a11y prose (title/desc) before reading text, or an inline-SVG graph choice leaks its CSS
  // block + verbalized math (#36).
  //
  // Scope to DIRECT children of the outer <ul>, structurally (`:scope >` is unsupported in happy-dom):
  // a graph choice's <li> ALSO contains a NESTED a11y point-list <ul><li> (CB's verbalized graph
  // description), and the old descendant selector `.answer-choices ul > li` over-matched those nested
  // <li>s — 4 real choices became 28 phantom rows (#82).
  const choiceList = root.querySelector('.answer-choices ul');
  const choiceLis = choiceList ? [...choiceList.children].filter((el) => el.localName === 'li') : [];
  const choices: Choice[] = choiceLis.map((li, i) => {
    const letter = 'ABCD'[i] ?? '';
    // Graph (inline-SVG) choice BEFORE the math path (#82): a real graph <svg> must win over the a11y
    // point-list MathML, or readChoiceMath grabs that verbalized MathML and the graph is mistaken for a
    // math choice (dropped, prose leaked as text). The distinction from a MathJax MATH choice — which
    // ALSO contains an <svg> glyph layer — is that the glyph <svg> is nested inside an <mjx-container>;
    // a real graph <svg> is NOT. So a normal #35 math choice has graphSvg === undefined and still flows
    // through readChoiceMath unchanged. (#36's bare <svg> choices have no mjx-container, so they take
    // this graph path and still produce imgSrc + empty text — issue #36 preserved.)
    const graphSvg = [...li.querySelectorAll('svg')].find((svg) => !svg.closest('mjx-container'));
    if (graphSvg) {
      const imgSrc = serializeSvgChoice(graphSvg);
      if (imgSrc) {
        // Build the a11y/fallback text from the <li> minus the noise: the nested point-list <ul> plus
        // CB's SVG a11y prose and any MathML. For the graph fixture this lands empty (correct —
        // choiceBody falls the <img alt> back to the letter); we never leak the verbalized fraction
        // prose, narration, or CSS into choice.text.
        const clone = li.cloneNode(true) as Element;
        clone.querySelectorAll('ul, title, desc, style, script, math, annotation, annotation-xml').forEach((n) => n.remove());
        return { letter, text: collapse(clone.textContent), imgSrc };
      }
      // FAIL SAFE (invariant #6): a non-serializable svg falls through to the existing text/img path
      // below rather than dropping the choice or suppressing the overlay.
    }
    // MathJax/MathML choice (issue #35): read the SEMANTIC <math> into the AST; use a CLEANED
    // textContent (visual glyph layer + TeX stripped) for the a11y/fallback string.
    const math = readChoiceMath(li);
    if (math) return { letter, text: readChoiceText(li), math };
    // Image-based multi-part choice ("[img] and [img]"): each math expression is an inline
    // <img class="math-img"> joined by literal connective text. Capture the ordered parts so the overlay
    // renders every image, not just the connective (which alone read as "and"). A lone image with no
    // surrounding text returns undefined here and stays on the imgSrc path below.
    const parts = readChoiceParts(li);
    if (parts) return { letter, text: partsText(parts), parts };
    // No <math>: clone + strip style/script and SVG a11y prose (title/desc) so an inline-SVG graph
    // choice doesn't leak its CSS/verbalized-math into text (#36); then image / SVG / plain-text.
    const clone = li.cloneNode(true) as Element;
    clone.querySelectorAll('style, script, title, desc').forEach((n) => n.remove());
    const text = collapse(clone.textContent);
    if (!text) {
      const img = li.querySelector('img');
      if (img?.src) return { letter, text: img.alt || '', imgSrc: img.src };
      // Inline-SVG graph choice (parabola, #36): serialize the real graph to an inert
      // data:image/svg+xml URL so the overlay's existing <img> path renders CB's own pixels.
      const svg = serializeSvgChoice(li);
      if (svg) return { letter, text, imgSrc: svg };
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
