// ISOLATED CB-DOM KNOWLEDGE. The only place (with observer.ts) that knows CB's HTML shape.
// Pure read: returns a clean view-model. Question text is for in-RAM spotlighting only — never stored.
// Selectors calibrated against the LIVE Educator Question Bank DOM (DOM-contract spike, 2026-06-15).
export interface Choice { letter: string; text: string; }
export interface QuestionView {
  id: string;
  section: string; domain: string; skill: string; difficulty: string;
  stem: string;                        // RAM-only (spotlight); never persisted
  choices: Choice[];                   // MC only; empty for grid-in (student-produced response)
  correctAnswer: string | null;        // present only once CB's rationale is revealed
  explanation: string | null;          // RAM-only; never persisted
}

// CB question IDs are 8 hex chars. Bounding the capture to exactly 8 stops adjacent text (e.g. a
// "Copy" button rendered next to the heading) from leaking trailing hex digits into the id.
const ID_RE = /Question ID:\s*([0-9a-f]{8})/i;
const ANS_RE = /Correct Answer:\s*(.+)/i;

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
    stem: (root.querySelector('.question-content')?.textContent ?? '').trim(),
    choices,
    correctAnswer,
    explanation: (rationale?.textContent ?? '').trim() || null,
  };
}
