import { observeQuestions } from '../cb/observer';

// Plan 1 proof-of-life: detect questions on CB's results page and log only their IDs/skill.
// NOTHING is stored and NO question text is logged — this is the live-spike harness.
observeQuestions(document, (view) => {
  console.log('[focused-practice] question detected:', view.id, '·', view.skill, '·', view.difficulty,
    '· choices:', view.choices.length, '· answerReadable:', view.correctAnswer !== null);
});
