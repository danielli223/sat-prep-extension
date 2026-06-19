// ISOLATED CB-DOM KNOWLEDGE. The only place (with observer.ts) that knows CB's HTML shape.
// Pure read: returns a clean view-model. Question text is for in-RAM spotlighting only — never stored.
// Selectors calibrated against the LIVE Educator Question Bank DOM (DOM-contract spike, 2026-06-15).
export interface Choice { letter: string; text: string; imgSrc?: string; }
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
    const text = (li.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) {
      const img = li.querySelector('img');
      if (img?.src) return { letter: 'ABCD'[i] ?? '', text: img.alt || '', imgSrc: img.src };
    }
    return { letter: 'ABCD'[i] ?? '', text };
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
