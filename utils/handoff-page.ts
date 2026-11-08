// Finishes a lookup another site started. USTA refuses its search API from the extension's background worker, so
// "Find on USTA" from a UTR profile opens USTA's own search page with the name and a marker. On that page, the search
// runs from inside USTA's site, the same way the page's own requests do, and the panel offers the player.

import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { diag } from './diagnostics';
import { createLookupController } from './lookup-controller';
import type { Candidate } from './matching';
import type { Site } from './sites';

export interface HandoffAdapter {
  /** The site the user came from, whose player we're finding here. */
  from: Site;
  /** The player's name when this page was opened by the extension to find them; otherwise null. */
  handoffFromLocation(loc: Location): { name: string } | null;
  /** Searches this site by name, from within the page. */
  find: (name: string) => Promise<Candidate[]>;
}

/**
 * Handles only the lookup this tab was opened for. The marker can linger in the URL while the user goes on to search
 * other names in the site's own search box; those are the user's own searches, so the panel steps away.
 */
export function runHandoffPage(ctx: ContentScriptContext, adapter: HandoffAdapter): void {
  const handoff = adapter.handoffFromLocation(location);
  const name = handoff?.name.trim();
  if (!name) return;

  // The user's click opened this page to find the player, so search straight away.
  const controller = createLookupController(ctx, {
    site: adapter.from,
    find: adapter.find,
    sameTab: true,
    searchOnLoad: true,
  });
  diag('Finishing a lookup started on the other site', { nameLength: name.length });
  controller.start();
  controller.setName(name, { byUser: true });

  const onLocationChange = () => {
    if (adapter.handoffFromLocation(location)?.name.trim() === name) return;
    diag('The user searched something else here; the hand-off is done');
    controller.stop();
    window.removeEventListener('wxt:locationchange', onLocationChange);
  };
  ctx.addEventListener(window, 'wxt:locationchange', onLocationChange);
}
