// The small floating panel shown on profile pages: the same player on the other site, one click away.
// Rendered inside a shadow root so the host site's styles can't affect it and ours can't leak out.
// Pure view: state comes in, user intents go out.

import brandIconSvg from '~/assets/icon.svg?raw';
import type { Candidate } from './matching';
import { handoffUrl, otherSite, profileUrl, searchUrl, siteLabels, type Site } from './sites';

export type PanelView =
  | { kind: 'reading' }
  | { kind: 'ready' }
  | { kind: 'looking' }
  | { kind: 'match'; candidate: Candidate }
  | { kind: 'choose'; candidates: readonly Candidate[] }
  | { kind: 'retry'; problem?: 'no-results' | 'failed' | 'refused' }
  | { kind: 'manual' };

export interface PanelModel {
  site: Site;
  name: string;
  view: PanelView;
  collapsed: boolean;
  /** Open profiles in this tab: the page exists only to find this player. */
  sameTab?: boolean;
}

export interface PanelActions {
  onNameInput(name: string): void;
  onFind(): void;
  onNotRight(): void;
  onToggleCollapsed(): void;
  /** Copies a troubleshooting report to the clipboard; resolves to whether it worked. */
  onCopyDiagnostics(): Promise<boolean>;
}

export interface MatchPanel {
  render(model: PanelModel): void;
  remove(): void;
}

export function createMatchPanel(actions: PanelActions): MatchPanel {
  const host = document.createElement('ustautr-panel');
  const root = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  let wasCollapsed: boolean | undefined;

  return {
    render(model) {
      // Animate only when the panel appears or expands, not on every state change.
      const animate = wasCollapsed !== false && !model.collapsed;
      wasCollapsed = model.collapsed;
      root.replaceChildren(el('style', { textContent: STYLES }), renderPanel(model, actions, animate));
    },
    remove() {
      host.remove();
    },
  };
}

function renderPanel(model: PanelModel, actions: PanelActions, animate: boolean): HTMLElement {
  const target = siteLabels[otherSite(model.site)];

  if (model.collapsed) {
    return el(
      'button',
      { className: 'pill', title: `Show ${target} lookup`, onclick: actions.onToggleCollapsed },
      brandMark(),
      el('span', {}, target),
    );
  }

  const header = el(
    'header',
    { className: 'header' },
    el(
      'span',
      { className: 'brand' },
      brandMark(),
      el('span', {}, `${siteLabels[model.site]} → ${target}`),
    ),
    el(
      'span',
      { className: 'header-actions' },
      diagnosticsButton(actions),
      el(
        'button',
        { className: 'icon-button', title: 'Minimize (Esc)', ariaLabel: 'Minimize', onclick: actions.onToggleCollapsed },
        minimizeIcon(),
      ),
    ),
  );

  return el(
    'section',
    {
      className: animate ? 'card enter' : 'card',
      ariaLabel: `${siteLabels[model.site]} to ${target}`,
      onkeydown: (event: KeyboardEvent) => {
        if (event.key === 'Escape') actions.onToggleCollapsed();
      },
    },
    header,
    el('div', { className: 'body', ariaLive: 'polite' }, handoffContext(model), ...renderBody(model, actions)),
  );
}

/** On a page opened just to find a player from the other site, say whose lookup this is. */
function handoffContext(model: PanelModel): HTMLElement | string {
  const name = model.name.trim();
  if (!model.sameTab || !name) return '';
  return el('p', { className: 'context' }, 'Finding ', el('strong', {}, name), ` from ${siteLabels[model.site]}`);
}

function renderBody(model: PanelModel, actions: PanelActions): (Node | string)[] {
  const other = otherSite(model.site);
  const target = siteLabels[other];
  const { view } = model;
  const playerName = model.name.trim();
  /** The other site's own search page, where it shows results on arrival (USTA); null otherwise (UTR). */
  const searchPage = (variant: 'primary' | 'secondary') => {
    const href = searchUrl(other, playerName);
    return href
      ? newTabLink({ href, label: `Search on ${target}`, variant, caption: `Opens ${target}'s player search in a new tab` })
      : null;
  };
  const profileLink = (candidate: Candidate) =>
    model.sameTab
      ? el('a', { className: 'btn primary block', href: profileUrl(candidate.player.site, candidate.player.id) }, `Open on ${target}`)
      : newTabLink({ href: profileUrl(candidate.player.site, candidate.player.id), label: `Open on ${target}`, variant: 'primary' });

  switch (view.kind) {
    case 'reading':
      return [
        el('p', { className: 'eyebrow' }, el('span', { className: 'spinner', ariaHidden: 'true' }), `Find on ${target}`),
        el('p', { className: 'muted' }, 'Reading the player’s name…'),
      ];

    case 'ready':
      return [
        el('p', { className: 'eyebrow' }, `Find on ${target}`),
        el(
          'div',
          { className: 'player' },
          avatar(playerName),
          el('span', { className: 'lines' }, el('span', { className: 'player-name' }, playerName), el('span', { className: 'muted' }, `On this ${siteLabels[model.site]} page`)),
        ),
        el(
          'button',
          { className: 'btn primary block', title: `Search ${target} for ${playerName}`, onclick: actions.onFind },
          searchIcon(),
          `Find on ${target}`,
        ),
      ];

    case 'looking':
      return [
        el('p', { className: 'eyebrow' }, el('span', { className: 'spinner', ariaHidden: 'true' }), `Searching ${target}`),
        el(
          'div',
          { className: 'player skeleton', ariaHidden: 'true' },
          el('span', { className: 'avatar' }),
          el('span', { className: 'lines' }, el('span', { className: 'line wide' }), el('span', { className: 'line' })),
        ),
        el('p', { className: 'muted' }, playerName ? `Finding ${playerName}…` : 'Reading the player’s name…'),
      ];

    case 'match': {
      const { candidate } = view;
      return [
        el('p', { className: 'eyebrow' }, `Found on ${target}`),
        playerSummary(candidate),
        profileLink(candidate),
        el('button', { className: 'text-button', onclick: actions.onNotRight }, 'Not the right player?'),
      ];
    }

    case 'choose':
      return [
        el('p', { className: 'eyebrow' }, `${view.candidates.length} possible players on ${target}`),
        el('p', {}, playerName ? `Which one is ${playerName}?` : 'Which one is this player?'),
        el('ul', { className: 'choices' }, ...view.candidates.map((c) => el('li', {}, choiceLink(c, target, !!model.sameTab)))),
        el('div', { className: 'divider' }, 'None of these?'),
        nameSearch(model, actions, target, 'Search a different name'),
        searchPage('secondary') ?? '',
      ];

    case 'retry': {
      if (view.problem === 'refused') {
        const page = searchPage('primary');
        return [
          el('p', { className: 'eyebrow' }, 'Automatic search unavailable'),
          el(
            'p',
            {},
            page
              ? `${target} didn't allow an automatic search from here. Its own search page works, already filled in` +
                  (playerName ? ` with ${playerName}.` : '.')
              : `${target} didn't allow an automatic search from here.`,
          ),
          page ?? '',
          page ? el('p', { className: 'muted' }, `If ${target} asks you to sign in, do that first; its search needs an account.`) : '',
        ];
      }
      const message =
        view.problem === 'no-results'
          ? `No one named ${playerName || 'that'} turned up on ${target}. Check the spelling, or try a shorter name.`
          : view.problem === 'failed'
            ? `${target} didn't respond. Try again in a moment.`
            : `Couldn't read the player's name from this page. Type it to find them on ${target}.`;
      const page = searchPage('secondary');
      return [
        el('p', { className: 'eyebrow' }, view.problem === 'failed' ? `${target} unavailable` : `Not found on ${target}`),
        el('p', {}, message),
        nameSearch(model, actions, target, 'Player name'),
        page ? el('div', { className: 'divider' }, 'or') : '',
        page ?? '',
      ];
    }

    case 'manual': {
      const handoff = handoffUrl(other, playerName);
      if (!playerName) {
        return [
          el('p', { className: 'eyebrow' }, el('span', { className: 'spinner', ariaHidden: 'true' }), `Find on ${target}`),
          el('p', { className: 'muted' }, 'Reading the player’s name…'),
        ];
      }
      return [
        el('p', { className: 'eyebrow' }, `Find on ${target}`),
        el('p', {}, `Find ${playerName} on ${target}.`),
        handoff
          ? newTabLink({
              href: handoff,
              label: `Find on ${target}`,
              variant: 'primary',
              caption: `Opens ${target} in a new tab and finds the player there`,
            })
          : (searchPage('primary') ?? ''),
      ];
    }
  }
}

/** The panel's own search: a name field and Find. Results show right here in the panel. */
function nameSearch(model: PanelModel, actions: PanelActions, target: string, label: string): HTMLElement {
  const input = el('input', {
    id: 'ustautr-name',
    type: 'text',
    value: model.name,
    placeholder: 'First and last name',
    autocomplete: 'off',
    oninput: () => actions.onNameInput(input.value),
    onkeydown: (event: KeyboardEvent) => {
      if (event.key === 'Enter') actions.onFind();
    },
  });
  return el(
    'div',
    { className: 'field' },
    el('label', { htmlFor: 'ustautr-name' }, label),
    el(
      'div',
      { className: 'input-row' },
      input,
      el('button', { className: 'btn primary', title: `Search ${target} for this name`, onclick: actions.onFind }, 'Find'),
    ),
  );
}

/** A small header button that copies a troubleshooting report, and confirms it did. */
function diagnosticsButton(actions: PanelActions): HTMLElement {
  const label = 'Copy diagnostics: a short report of what the extension tried, to share when something isn’t working';
  const button = el(
    'button',
    {
      className: 'icon-button',
      title: label,
      ariaLabel: 'Copy diagnostics',
      onclick: async () => {
        const copied = await actions.onCopyDiagnostics();
        button.replaceChildren(copied ? checkIcon() : diagnosticsIcon());
        button.title = copied ? 'Diagnostics copied to the clipboard' : 'Couldn’t copy diagnostics';
        button.setAttribute('aria-label', button.title);
      },
    },
    diagnosticsIcon(),
  );
  return button;
}

/** A clipboard with lines: "copy a report". */
function diagnosticsIcon(): SVGSVGElement {
  return icon('ui-icon', ['M6 2.5h4v2H6z', 'M10 3.5h1.5a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1H6', 'M6 8h4', 'M6 10.5h3']);
}

function checkIcon(): SVGSVGElement {
  return icon('ui-icon', ['M3.5 8.5 6.5 11.5 12.5 5']);
}

/** Initials, name and details: the "who" of a match. */
function playerSummary(candidate: Candidate): HTMLElement {
  return el(
    'div',
    { className: 'player' },
    avatar(candidate.player.name),
    playerLines(candidate),
  );
}

/** The other site's rating, as it shows it, in a small badge. Muted when there's no value to show. */
function ratingBadge(candidate: Candidate): HTMLElement | string {
  const { rating } = candidate;
  if (!rating) return '';
  return el(
    'span',
    {
      className: rating.muted ? 'rating muted-rating' : 'rating',
      title: rating.note ?? 'Rating as the site shows it to signed-out visitors',
    },
    rating.label,
  );
}

/** Name, details and rating, stacked so nothing needs to be cut off. */
function playerLines(candidate: Candidate): HTMLElement {
  return el(
    'span',
    { className: 'lines' },
    el('span', { className: 'player-name' }, candidate.player.name),
    candidate.details ? el('span', { className: 'muted' }, candidate.details) : '',
    ratingBadge(candidate),
  );
}

/** Everything about a candidate in one line, for tooltips. */
function describeCandidate(candidate: Candidate): string {
  return [candidate.player.name, candidate.details, candidate.rating?.label].filter(Boolean).join(' · ');
}

interface NewTabLinkOptions {
  href: string;
  label: string;
  variant: 'primary' | 'secondary';
  /** A line under the button saying where it goes. */
  caption?: string;
}

/** A full-width, button-styled link that opens the other site in a new tab and says so (icon, tooltip, screen-reader text). */
function newTabLink({ href, label, variant, caption }: NewTabLinkOptions): HTMLElement {
  const link = el(
    'a',
    {
      className: `btn ${variant} block`,
      href,
      target: '_blank',
      rel: 'noopener',
      title: `${label} (opens in a new tab)`,
    },
    label,
    newTabIcon(),
    el('span', { className: 'sr-only' }, ' (opens in a new tab)'),
  );
  return caption ? el('div', { className: 'new-tab' }, link, el('p', { className: 'caption' }, caption)) : link;
}

/** One row in the list of possible players. The whole row is the link. */
function choiceLink(candidate: Candidate, target: string, sameTab: boolean): HTMLAnchorElement {
  const href = profileUrl(candidate.player.site, candidate.player.id);
  if (sameTab) {
    return el(
      'a',
      { className: 'choice', href, title: `Open on ${target}: ${describeCandidate(candidate)}` },
      avatar(candidate.player.name, 'small'),
      playerLines(candidate),
    );
  }
  return el(
    'a',
    {
      className: 'choice',
      href,
      target: '_blank',
      rel: 'noopener',
      title: `Open on ${target} (new tab): ${describeCandidate(candidate)}`,
    },
    avatar(candidate.player.name, 'small'),
    playerLines(candidate),
    newTabIcon(),
    el('span', { className: 'sr-only' }, ' (opens in a new tab)'),
  );
}

/** A circle with the player's initials, tinted consistently per name so a list is easy to scan. */
function avatar(name: string, size: 'small' | 'regular' = 'regular'): HTMLElement {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = ((words[0]?.[0] ?? '') + (words.length > 1 ? (words.at(-1)?.[0] ?? '') : '')).toUpperCase();
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const node = el('span', { className: size === 'small' ? 'avatar small' : 'avatar', ariaHidden: 'true' }, initials || '?');
  node.dataset.tone = String(hash % 6);
  return node;
}

/** The extension's icon (assets/icon.svg, the same file the toolbar and extensions page use). */
function brandMark(): HTMLElement {
  const mark = el('span', { className: 'brand-mark', ariaHidden: 'true' });
  mark.innerHTML = brandIconSvg; // our own static asset, bundled at build time
  return mark;
}

function searchIcon(): SVGSVGElement {
  return icon('new-tab-icon', ['M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11Z', 'M11 11l3.5 3.5']);
}

function newTabIcon(): SVGSVGElement {
  return icon('new-tab-icon', ['M9 2h5v5', 'M14 2 7 9', 'M12 9.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3.5']);
}

function minimizeIcon(): SVGSVGElement {
  return icon('ui-icon', ['M3.5 8h9']);
}

function icon(className: string, paths: string[]): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  for (const d of paths) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

type Props<K extends keyof HTMLElementTagNameMap> = Partial<Omit<HTMLElementTagNameMap[K], 'style'>>;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props<K>,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  // Set ARIA props as attributes too: not every browser reflects ariaLabel and friends onto attributes.
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('aria') && typeof value === 'string') node.setAttribute(`aria-${key.slice(4).toLowerCase()}`, value);
  }
  node.append(...children);
  return node;
}

const STYLES = `
:host {
  all: initial;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --bg: #ffffff;
  --fg: #1f2328;
  --muted: #5d6670;
  --border: #dde2e8;
  --subtle: #f5f7f9;
  --hover: #eef2f6;
  --accent: #1f6feb;
  --accent-hover: #1a5fd0;
  --accent-fg: #ffffff;
  --focus: #1f6feb;
  --shadow: 0 1px 2px rgba(15, 23, 42, 0.06), 0 12px 32px rgba(15, 23, 42, 0.16);
  --skeleton: #e9edf1;
  --skeleton-shine: #f6f8fa;
}
@media (prefers-color-scheme: dark) {
  :host {
    --bg: #1c2128;
    --fg: #e6edf3;
    --muted: #9ba5b0;
    --border: #353c45;
    --subtle: #22272e;
    --hover: #2a313a;
    --accent: #4493f8;
    --accent-hover: #5a9ff9;
    --accent-fg: #0d1117;
    --focus: #6cb0ff;
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 12px 32px rgba(0, 0, 0, 0.5);
    --skeleton: #2a313a;
    --skeleton-shine: #353c45;
  }
}

* { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
p { margin: 0; }
button, a { font: inherit; cursor: pointer; text-decoration: none; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

.card, .pill {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  color: var(--fg); background: var(--bg); border: 1px solid var(--border); box-shadow: var(--shadow);
}
.card { width: 320px; max-width: calc(100vw - 32px); border-radius: 14px; font-size: 13px; line-height: 1.45; overflow: hidden; }
.card.enter { animation: enter 180ms ease-out; }
@keyframes enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

.pill { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px 6px 8px; border-radius: 999px; font-size: 13px; font-weight: 600; line-height: 1.2; }
.pill:hover { background: var(--subtle); }

.header { display: flex; align-items: center; justify-content: space-between; padding: 10px 10px 10px 14px; border-bottom: 1px solid var(--border); }
.brand { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: var(--muted); letter-spacing: 0.01em; }
.brand-mark { display: inline-block; flex: none; width: 22px; height: 22px; }
.brand-mark svg { display: block; width: 100%; height: 100%; }
.pill .brand-mark { width: 20px; height: 20px; }
.header-actions { display: inline-flex; align-items: center; gap: 2px; }
.icon-button { display: inline-grid; place-items: center; width: 28px; height: 28px; border: none; border-radius: 8px; background: none; color: var(--muted); }
.icon-button:hover { background: var(--hover); color: var(--fg); }
.ui-icon { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }

.body { display: flex; flex-direction: column; gap: 12px; padding: 14px; }
.eyebrow { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
.muted { color: var(--muted); font-size: 12px; }
.context { padding: 7px 10px; border-radius: 8px; background: var(--subtle); color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.context strong { color: var(--fg); font-weight: 600; }

.player { display: flex; align-items: center; gap: 12px; }
.lines { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.player-name { font-weight: 600; font-size: 15px; overflow-wrap: anywhere; }
.choice .player-name { font-size: 13px; }
.lines .muted { overflow-wrap: anywhere; }
.lines .rating { align-self: flex-start; margin-top: 4px; }

.rating {
  flex: none; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums;
  color: var(--accent); background: var(--subtle); border: 1px solid var(--border); white-space: nowrap;
}
.choice .rating { font-size: 11px; padding: 1px 7px; }
.rating.muted-rating { color: var(--muted); font-weight: 600; cursor: help; }
.avatar {
  display: inline-grid; place-items: center; flex: none; width: 44px; height: 44px; border-radius: 50%;
  font-size: 15px; font-weight: 700; letter-spacing: 0.02em;
}
.avatar.small { width: 32px; height: 32px; font-size: 12px; }
.avatar[data-tone="0"] { background: #dbeafe; color: #1e40af; }
.avatar[data-tone="1"] { background: #dcfce7; color: #166534; }
.avatar[data-tone="2"] { background: #fef3c7; color: #92400e; }
.avatar[data-tone="3"] { background: #fce7f3; color: #9d174d; }
.avatar[data-tone="4"] { background: #ede9fe; color: #5b21b6; }
.avatar[data-tone="5"] { background: #ccfbf1; color: #115e59; }
@media (prefers-color-scheme: dark) {
  .avatar[data-tone="0"] { background: #1e3a5f; color: #bfdbfe; }
  .avatar[data-tone="1"] { background: #1c3d2a; color: #bbf7d0; }
  .avatar[data-tone="2"] { background: #45351a; color: #fde68a; }
  .avatar[data-tone="3"] { background: #4a2338; color: #fbcfe8; }
  .avatar[data-tone="4"] { background: #352a55; color: #ddd6fe; }
  .avatar[data-tone="5"] { background: #163f3c; color: #99f6e4; }
}

.skeleton .avatar, .skeleton .line {
  background: linear-gradient(90deg, var(--skeleton) 25%, var(--skeleton-shine) 50%, var(--skeleton) 75%);
  background-size: 200% 100%; animation: shimmer 1.2s linear infinite;
}
.skeleton .line { display: block; height: 10px; width: 55%; border-radius: 5px; margin: 3px 0; }
.skeleton .line.wide { width: 80%; height: 12px; }
@keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.spinner { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--border); border-top-color: var(--accent); animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 9px 14px;
  border-radius: 9px; border: 1px solid transparent; font-weight: 600; font-size: 13px; line-height: 1.2;
  transition: background-color 120ms ease, border-color 120ms ease;
}
.btn.block { width: 100%; }
.primary { background: var(--accent); color: var(--accent-fg); }
.primary:hover { background: var(--accent-hover); }
.secondary { background: var(--subtle); color: var(--fg); border-color: var(--border); }
.secondary:hover { background: var(--hover); }
.new-tab-icon { width: 14px; height: 14px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.new-tab { display: flex; flex-direction: column; gap: 6px; }
.caption { color: var(--muted); font-size: 11px; text-align: center; }
.text-button { align-self: center; border: none; background: none; padding: 2px 4px; color: var(--muted); font-size: 12px; text-decoration: underline; text-underline-offset: 3px; }
.text-button:hover { color: var(--fg); }

.choices { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; max-height: 248px; overflow-y: auto; }
.choice {
  display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 10px;
  color: inherit; transition: background-color 120ms ease, border-color 120ms ease;
}
.choice:hover { background: var(--subtle); border-color: var(--accent); }
.choice .new-tab-icon { color: var(--muted); margin-top: 2px; }
.choice:hover .new-tab-icon { color: var(--accent); }

.field { display: flex; flex-direction: column; gap: 6px; }
label { font-size: 12px; font-weight: 600; color: var(--muted); }
.input-row { display: flex; gap: 8px; }
input {
  flex: 1; min-width: 0; padding: 8px 10px; font: inherit; font-size: 13px; color: var(--fg); background: var(--bg);
  border: 1px solid var(--border); border-radius: 9px;
}
input:focus-visible { outline: 2px solid var(--focus); outline-offset: 0; border-color: transparent; }

.divider { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 11px; }
.divider::before, .divider::after { content: ""; flex: 1; border-top: 1px solid var(--border); }

.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@media (prefers-reduced-motion: reduce) {
  .card.enter, .skeleton .avatar, .skeleton .line, .spinner { animation: none; }
  .btn, .choice { transition: none; }
}
`;
