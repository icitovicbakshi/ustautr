// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMatchPanel, type PanelActions, type PanelModel } from '../utils/match-panel';
import type { Candidate } from '../utils/matching';

const alexOnUtr: Candidate = { player: { site: 'utr', id: '1001', name: 'Alex Rivera' }, details: 'Austin, TX · U13', rating: { label: 'UTR 4.12' } };
const otherAlexOnUtr: Candidate = { player: { site: 'utr', id: '1002', name: 'Alex Rivera' }, details: 'Miami, FL · U16' };
const alexOnUsta: Candidate = { player: { site: 'usta', id: '2000000001', name: 'Alex Rivera' }, details: '' };

function actionSpies(): PanelActions {
  return {
    onNameInput: vi.fn(),
    onFind: vi.fn(),
    onNotRight: vi.fn(),
    onToggleCollapsed: vi.fn(),
    onCopyDiagnostics: vi.fn(async () => true),
  };
}

function renderPanel(model: Partial<PanelModel>, actions = actionSpies()) {
  createMatchPanel(actions).render({ site: 'usta', name: 'Alex Rivera', view: { kind: 'looking' }, collapsed: false, ...model });
  const root = document.querySelector('ustautr-panel')!.shadowRoot!;
  const control = (text: string) =>
    [...root.querySelectorAll<HTMLElement>('button, a')].find((b) => b.textContent?.startsWith(text))!;
  return { root, control, actions };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('match panel', () => {
  it('offers a search of the other site, run only when the user clicks', () => {
    const { root, control, actions } = renderPanel({ view: { kind: 'ready' } });

    expect(root.textContent).toContain('Alex Rivera');
    control('Find on UTR').click();
    expect(actions.onFind).toHaveBeenCalled();
  });

  it('shows the extension icon in the header and the collapsed chip', () => {
    expect(renderPanel({ view: { kind: 'ready' } }).root.querySelector('.brand-mark svg')).toBeTruthy();
    document.body.replaceChildren();
    expect(renderPanel({ collapsed: true }).root.querySelector('.pill .brand-mark svg')).toBeTruthy();
  });

  it('shows progress while finding the player', () => {
    const { root } = renderPanel({ view: { kind: 'looking' } });

    expect(root.textContent).toContain('Searching UTR');
    expect(root.textContent).toContain('Finding Alex Rivera…');
  });

  it('opens the player on the other site in one click, in a new tab', () => {
    const { root, control } = renderPanel({ view: { kind: 'match', candidate: alexOnUtr } });

    const open = control('Open on UTR');
    expect(open.getAttribute('href')).toBe('https://app.utrsports.net/profiles/1001');
    expect(open.getAttribute('target')).toBe('_blank');
    expect(open.textContent).toContain('(opens in a new tab)');
    expect(root.textContent).toContain('Austin, TX · U13');
  });

  it('shows the UTR rating on the card and in the list', () => {
    expect(renderPanel({ view: { kind: 'match', candidate: alexOnUtr } }).root.querySelector('.rating')?.textContent).toBe('UTR 4.12');
    document.body.replaceChildren();
    const { root } = renderPanel({ view: { kind: 'choose', candidates: [alexOnUtr, otherAlexOnUtr] } });
    expect([...root.querySelectorAll('.choice .rating')].map((r) => r.textContent)).toEqual(['UTR 4.12']);
  });

  it('marks a rating UTR keeps private, with an explanation', () => {
    const hidden: Candidate = {
      ...otherAlexOnUtr,
      rating: { label: 'UTR hidden', muted: true, note: 'UTR doesn’t show this player’s rating publicly' },
    };
    const { root } = renderPanel({ view: { kind: 'match', candidate: hidden } });

    const badge = root.querySelector('.rating')!;
    expect(badge.textContent).toBe('UTR hidden');
    expect(badge.className).toContain('muted-rating');
    expect(badge.getAttribute('title')).toContain('publicly');
  });

  it('puts the full name, details and rating in each row’s tooltip', () => {
    const { root } = renderPanel({ view: { kind: 'choose', candidates: [alexOnUtr] } });

    expect(root.querySelector('a.choice')!.getAttribute('title')).toContain('Alex Rivera · Austin, TX · U13 · UTR 4.12');
  });

  it('shows the player’s initials', () => {
    const { root } = renderPanel({ view: { kind: 'match', candidate: alexOnUtr } });

    expect(root.querySelector('.avatar')?.textContent).toBe('AR');
  });

  it('works the same way from UTR to USTA', () => {
    const { control } = renderPanel({ site: 'utr', view: { kind: 'match', candidate: alexOnUsta } });

    expect(control('Open on USTA').getAttribute('href')).toBe(
      'https://www.usta.com/en/home/play/player-search/profile.html#uaid=2000000001',
    );
  });

  it('lets the user say the player is wrong', () => {
    const { control, actions } = renderPanel({ view: { kind: 'match', candidate: alexOnUtr } });

    control('Not the right player?').click();

    expect(actions.onNotRight).toHaveBeenCalled();
  });

  it('lists possible players, each one click from their profile', () => {
    const { root } = renderPanel({ view: { kind: 'choose', candidates: [alexOnUtr, otherAlexOnUtr] } });

    expect(root.textContent).toContain('2 possible players on UTR');
    const choices = [...root.querySelectorAll<HTMLAnchorElement>('a.choice')];
    expect(choices.map((c) => c.getAttribute('href'))).toEqual([
      'https://app.utrsports.net/profiles/1001',
      'https://app.utrsports.net/profiles/1002',
    ]);
    const second = choices[1]!;
    expect(second.textContent).toContain('Miami, FL · U16');
    expect(second.getAttribute('target')).toBe('_blank');
  });

  it('searches from inside the panel rather than sending the user to UTR’s search page', () => {
    const { root, control, actions } = renderPanel({ view: { kind: 'retry', problem: 'no-results' } });

    expect(root.textContent).toContain('No one named Alex Rivera turned up on UTR');
    expect(control('Search on UTR')).toBeUndefined();
    const input = root.querySelector('input')!;
    input.value = 'Alex Q Rivera';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(actions.onNameInput).toHaveBeenCalledWith('Alex Q Rivera');
    expect(actions.onFind).toHaveBeenCalled();
  });

  it('offers a different-name search under the list of possible players', () => {
    const { root, control, actions } = renderPanel({ view: { kind: 'choose', candidates: [alexOnUtr, otherAlexOnUtr] } });

    expect(root.textContent).toContain('None of these?');
    control('Find').click();
    expect(actions.onFind).toHaveBeenCalled();
  });

  it('links to USTA’s search page, which shows results on arrival, opening in a new tab', () => {
    const { root, control } = renderPanel({ site: 'utr', view: { kind: 'retry', problem: 'no-results' } });

    const search = control('Search on USTA');
    expect(search.getAttribute('href')).toBe(
      'https://www.usta.com/en/home/play/player-search.html#page=1&searchText=Alex%20Rivera',
    );
    expect(search.getAttribute('target')).toBe('_blank');
    expect(root.textContent).toContain("Opens USTA's player search in a new tab");
  });

  it('copies diagnostics from the header in any state, and confirms it', async () => {
    const { root, actions } = renderPanel({ view: { kind: 'choose', candidates: [alexOnUtr] } });

    root.querySelector<HTMLElement>('button[aria-label="Copy diagnostics"]')!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(actions.onCopyDiagnostics).toHaveBeenCalled();
    expect(root.querySelector('button[aria-label="Diagnostics copied to the clipboard"]')).toBeTruthy();
  });

  it('makes the prefilled site search the main action when the other site refuses automatic search', () => {
    const { root, control } = renderPanel({ site: 'utr', view: { kind: 'retry', problem: 'refused' } });

    expect(root.textContent).toContain("USTA didn't allow an automatic search");
    const search = control('Search on USTA');
    expect(search.className).toContain('primary');
    expect(search.getAttribute('href')).toBe(
      'https://www.usta.com/en/home/play/player-search.html#page=1&searchText=Alex%20Rivera',
    );
    expect(root.querySelector('input')).toBeNull();
  });

  it('offers "Find on USTA" from UTR, which opens USTA to finish the search there', () => {
    const { root, control } = renderPanel({ site: 'utr', view: { kind: 'manual' } });

    const find = control('Find on USTA');
    expect(find.getAttribute('href')).toBe(
      'https://www.usta.com/en/home/play/player-search.html#page=1&searchText=Alex%20Rivera&ustautr=1',
    );
    expect(find.getAttribute('target')).toBe('_blank');
    expect(root.textContent).toContain('Opens USTA in a new tab and finds the player there');
  });

  it('waits for the name before offering "Find on USTA"', () => {
    const { root, control } = renderPanel({ site: 'utr', name: '', view: { kind: 'manual' } });

    expect(control('Find on USTA')).toBeUndefined();
    expect(root.textContent).toContain('Reading the player’s name…');
  });

  it('says whose lookup it is on a page opened just to find them', () => {
    const { root } = renderPanel({ site: 'utr', sameTab: true, view: { kind: 'looking' } });

    expect(root.querySelector('.context')?.textContent).toBe('Finding Alex Rivera from UTR');
  });

  it('opens the player in the same tab on a page opened just to find them', () => {
    const alexOnUstaFound: Candidate = { ...alexOnUsta, details: 'Whitestone, NY · Eastern' };
    const { control } = renderPanel({ site: 'utr', sameTab: true, view: { kind: 'match', candidate: alexOnUstaFound } });

    const open = control('Open on USTA');
    expect(open.getAttribute('href')).toBe('https://www.usta.com/en/home/play/player-search/profile.html#uaid=2000000001');
    expect(open.getAttribute('target')).toBeNull();
  });

  it('minimizes from the header and with Escape, and expands from the pill', () => {
    const { root, actions } = renderPanel({ view: { kind: 'match', candidate: alexOnUtr } });

    root.querySelector<HTMLElement>('button[aria-label="Minimize"]')!.click();
    root.querySelector('.card')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(actions.onToggleCollapsed).toHaveBeenCalledTimes(2);

    document.body.replaceChildren();
    const collapsed = renderPanel({ collapsed: true });
    expect(collapsed.root.querySelector('.card')).toBeNull();
    const pill = collapsed.root.querySelector<HTMLElement>('.pill')!;
    expect(pill.textContent?.trim()).toBe('UTR');
    pill.click();
    expect(collapsed.actions.onToggleCollapsed).toHaveBeenCalled();
  });
});
