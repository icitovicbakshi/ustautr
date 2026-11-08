// The shared core behind every page the extension helps on: given a player's name, search the other site and drive
// the panel (searching → found / choose / not found). Page-specific code decides *when* there's a player and what
// their name is; this decides what to show.

import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { diag, diagnosticsReport } from './diagnostics';
import { isRefused } from './http-error';
import { createMatchPanel, type MatchPanel, type PanelView } from './match-panel';
import { decideMatch, MAX_CHOICES, type Candidate, type MatchDecision } from './matching';
import { otherSite, siteLabels, type Site } from './sites';

export type Lookup =
  /** Working out the player's name from the page. */
  | { status: 'reading' }
  /** Name known; waiting for the user to ask for a search. */
  | { status: 'ready' }
  /** The page never gave a name. */
  | { status: 'no-name' }
  | { status: 'loading' }
  | { status: 'done'; decision: MatchDecision; candidates: readonly Candidate[]; byUser: boolean }
  | { status: 'failed'; refused: boolean };

export interface ViewInput {
  canSearch: boolean;
  lookup: Lookup;
  /** The user said the offered player isn't the right one. */
  showAlternatives: boolean;
}

/** Decides what the panel shows. */
export function chooseView(input: ViewInput): PanelView {
  const { lookup } = input;
  if (!input.canSearch) return { kind: 'manual' };

  switch (lookup.status) {
    case 'reading':
      return { kind: 'reading' };
    case 'ready':
      return { kind: 'ready' };
    case 'loading':
      return { kind: 'looking' };
    case 'failed':
      return { kind: 'retry', problem: lookup.refused ? 'refused' : 'failed' };
    case 'no-name':
      return { kind: 'retry' };
    case 'done': {
      const { decision } = lookup;
      if (decision.kind === 'none') {
        // Automatic searches stay strict. When the user searched themselves, show what came back and let them pick.
        return lookup.byUser && lookup.candidates.length > 0
          ? { kind: 'choose', candidates: lookup.candidates.slice(0, MAX_CHOICES) }
          : { kind: 'retry', problem: 'no-results' };
      }
      if (decision.kind === 'several') return { kind: 'choose', candidates: decision.candidates };
      // A single clear match, unless the user said it's wrong: then show the other results too.
      if (!input.showAlternatives) return { kind: 'match', candidate: decision.candidate };
      return { kind: 'choose', candidates: lookup.candidates.slice(0, MAX_CHOICES) };
    }
  }
}

export interface LookupControllerOptions {
  /** The player's site: the panel finds them on the *other* site. */
  site: Site;
  /** Searches the other site by name. Absent when it can't be searched from this page. */
  find?: (name: string) => Promise<Candidate[]>;
  /** Open results in this tab (when the page exists only to find this player) rather than a new one. */
  sameTab?: boolean;
  /**
   * Search as soon as the name is known, instead of waiting for the user to click Find. Off by default: searching
   * the other site is the user's call. On where the user's click opened the page (the USTA hand-off).
   */
  searchOnLoad?: boolean;
}

export interface LookupController {
  /** A player is on the page; their name is still being worked out. */
  start(): void;
  /** The player's name is known. `byUser` when the user asked for this search, so every result is worth showing. */
  setName(name: string, options?: { byUser?: boolean }): void;
  /** The page never gave a name: ask the user for it. */
  nameUnavailable(): void;
  /** No player on this page any more. */
  stop(): void;
}

/** How long to wait for a name to settle before searching. These sites render client-side. */
const LOOKUP_DEBOUNCE_MS = 400;

export function createLookupController(ctx: ContentScriptContext, options: LookupControllerOptions): LookupController {
  const { site, find, sameTab = false, searchOnLoad = false } = options;
  const target = siteLabels[otherSite(site)];
  const canSearch = !!find;

  let active = false;
  let name = '';
  let nameEdited = false;
  let lookup: Lookup = { status: 'reading' };
  let showAlternatives = false;
  let collapsed = false;
  let panel: MatchPanel | null = null;
  let lookupTimer: number | undefined;
  let lookupSeq = 0;

  function refresh() {
    if (!active) {
      panel?.remove();
      panel = null;
      return;
    }
    panel ??= createMatchPanel(actions);
    panel.render({ site, name, view: chooseView({ canSearch, lookup, showAlternatives }), collapsed, sameTab });
  }

  async function runLookup({ byUser = false } = {}) {
    const query = name.trim();
    if (!find || !active || !query) return;

    const seq = ++lookupSeq;
    lookup = { status: 'loading' };
    refresh();
    diag(`Searching ${target}`, { nameLength: query.length, byUser });
    try {
      const candidates = await find(query);
      if (seq !== lookupSeq) return; // navigated or searched again meanwhile
      const decision = decideMatch(query, candidates);
      diag(`${target} search returned`, { results: candidates.length, decision: decision.kind });
      lookup = { status: 'done', decision, candidates, byUser };
    } catch (error) {
      if (seq !== lookupSeq) return;
      diag(`${target} search failed`, error);
      lookup = { status: 'failed', refused: isRefused(error) };
    }
    refresh();
  }

  function cancelPending() {
    lookupSeq++;
    clearTimeout(lookupTimer);
  }

  const actions = {
    onNameInput(value: string) {
      name = value;
      nameEdited = true;
    },

    async onFind() {
      showAlternatives = false;
      await runLookup({ byUser: true });
    },

    onNotRight() {
      showAlternatives = true;
      refresh();
    },

    onToggleCollapsed() {
      collapsed = !collapsed;
      refresh();
    },

    async onCopyDiagnostics(): Promise<boolean> {
      try {
        await navigator.clipboard.writeText(diagnosticsReport());
        return true;
      } catch (error) {
        diag('Could not copy diagnostics to the clipboard', error);
        return false;
      }
    },
  };

  ctx.onInvalidated(() => panel?.remove());

  return {
    start() {
      cancelPending();
      active = true;
      name = '';
      nameEdited = false;
      showAlternatives = false;
      lookup = { status: 'reading' };
      refresh();
    },

    setName(found, { byUser = false } = {}) {
      if (!active || !found || nameEdited || found === name) return;
      name = found;
      if (!searchOnLoad) {
        // Wait for the user's click, unless a search has already started or finished.
        if (lookup.status === 'reading' || lookup.status === 'no-name') lookup = { status: 'ready' };
        refresh();
        return;
      }
      lookup = { status: 'loading' };
      refresh();
      clearTimeout(lookupTimer);
      lookupTimer = ctx.setTimeout(() => void runLookup({ byUser }), LOOKUP_DEBOUNCE_MS);
    },

    nameUnavailable() {
      if (!active || name || lookup.status !== 'reading') return;
      lookup = { status: 'no-name' };
      refresh();
    },

    stop() {
      cancelPending();
      active = false;
      refresh();
    },
  };
}
