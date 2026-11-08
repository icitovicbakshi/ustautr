// Runs on one site's profile pages: works out who the player is, then hands their name to the lookup controller,
// which finds the same person on the other site. Each site supplies a small adapter.

import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { diag } from './diagnostics';
import { createLookupController } from './lookup-controller';
import type { Candidate } from './matching';
import { siteLabels, type Site } from './sites';

export interface SiteAdapter {
  site: Site;
  /** The player id for the current page, or null when this isn't a profile page. */
  profileIdFromLocation(loc: Location): string | null;
  /**
   * Where the player's name comes from. `load` fetches it by id (preferred: exact and fast); `read` takes it from
   * the rendered page and is used when there's no `load`, or when `load` fails.
   */
  playerName: {
    load?: (id: string) => Promise<string | null>;
    read?: () => string | null;
  };
  /** Searches the other site for this player. Absent when the other site can't be searched from here. */
  findOnOtherSite?: (name: string) => Promise<Candidate[]>;
  /** Describes the page for diagnostics when the name can't be found (counts and headings, not personal data). */
  diagnose?: () => unknown;
}

export function runProfilePage(ctx: ContentScriptContext, adapter: SiteAdapter): void {
  const { site } = adapter;
  const controller = createLookupController(ctx, { site, find: adapter.findOnOtherSite });
  let profileId: string | null = null;
  let stopNameWatch: (() => void) | null = null;

  function onNameFound(found: string | null, source: string) {
    if (!found) return;
    diag(`Player name found (${source})`, { length: found.length, words: found.split(/\s+/).length });
    controller.setName(found);
  }

  function onNameUnavailable() {
    diag('Gave up looking for the player name', adapter.diagnose?.());
    controller.nameUnavailable();
  }

  function loadPlayerName(id: string) {
    const { load, read } = adapter.playerName;
    const readFromPage = () => {
      if (id !== profileId) return;
      if (!read) return onNameUnavailable();
      diag(`Reading the player name from the page (up to ${NAME_WATCH_MS / 1000}s)`);
      stopNameWatch = watchPageName(ctx, read, (found) => onNameFound(found, 'page'), onNameUnavailable);
    };
    if (!load) return readFromPage();
    diag('Loading the player name by id');
    load(id)
      .then((found) => {
        if (id !== profileId) return;
        if (found) return onNameFound(found, 'api');
        diag('Name lookup by id returned no name');
        readFromPage();
      })
      .catch((error: unknown) => {
        diag('Name lookup by id failed', error);
        readFromPage();
      });
  }

  function onLocationChange() {
    const id = adapter.profileIdFromLocation(location);
    if (id === profileId) return;
    profileId = id;
    stopNameWatch?.();
    stopNameWatch = null;
    if (!id) return controller.stop();
    diag(`${siteLabels[site]} profile page`, { path: location.pathname });
    controller.start();
    loadPlayerName(id);
  }

  ctx.onInvalidated(() => stopNameWatch?.());
  ctx.addEventListener(window, 'wxt:locationchange', onLocationChange);
  onLocationChange();
}

/** How long to keep looking for the player's name on the page after a profile loads. */
const NAME_WATCH_MS = 15_000;

/** Reports the player name as the page renders it, for a limited time after navigation. */
function watchPageName(
  ctx: ContentScriptContext,
  read: () => string | null,
  onName: (name: string | null) => void,
  onGiveUp: () => void,
): () => void {
  let found = false;
  let scheduled = false;
  const check = () => {
    scheduled = false;
    const name = read();
    if (name) found = true;
    onName(name);
  };
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    ctx.setTimeout(check, 200);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  const stopTimer = ctx.setTimeout(() => {
    observer.disconnect();
    if (!found) onGiveUp();
  }, NAME_WATCH_MS);
  check();
  return () => {
    observer.disconnect();
    clearTimeout(stopTimer);
  };
}
