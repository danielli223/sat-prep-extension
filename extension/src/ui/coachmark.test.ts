import { describe, it, expect, vi } from 'vitest';
import { dropCoachmark, COACHMARK_CLASS } from './coachmark';

function shadow(): ShadowRoot {
  const hostEl = document.createElement('div');
  document.body.appendChild(hostEl);
  return hostEl.attachShadow({ mode: 'open' });
}

describe('dropCoachmark', () => {
  it('renders a skill-specific coachmark telling the student which filter to set', () => {
    const root = shadow();
    dropCoachmark(root, { skill: 'Inferences', onConfirm: vi.fn() });
    const mark = root.querySelector(`.${COACHMARK_CLASS}`)!;
    expect(mark.textContent).toContain('Inferences');           // names the skill to filter on
    expect(mark.textContent).toContain('CB');                   // points the student at CB's filter (D3)
    expect(root.querySelector('.fp-coachmark-confirm')).not.toBeNull();
  });

  it('fires onConfirm (the badger re-highlight hand-off) when the student confirms', () => {
    const root = shadow();
    const onConfirm = vi.fn();
    dropCoachmark(root, { skill: 'Inferences', onConfirm });
    (root.querySelector('.fp-coachmark-confirm') as HTMLElement).click();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('is idempotent: a second drop replaces the prior coachmark, never stacks two', () => {
    const root = shadow();
    dropCoachmark(root, { skill: 'A', onConfirm: vi.fn() });
    dropCoachmark(root, { skill: 'B', onConfirm: vi.fn() });
    expect(root.querySelectorAll(`.${COACHMARK_CLASS}`)).toHaveLength(1);
    expect(root.querySelector(`.${COACHMARK_CLASS}`)!.textContent).toContain('B');
  });

  it('dismiss removes the coachmark without firing onConfirm', () => {
    const root = shadow();
    const onConfirm = vi.fn();
    dropCoachmark(root, { skill: 'A', onConfirm });
    (root.querySelector('.fp-coachmark-dismiss') as HTMLElement).click();
    expect(root.querySelector(`.${COACHMARK_CLASS}`)).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
