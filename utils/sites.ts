// Link builders and parsers for each site. Everything that knows a site's URL shapes lives here,
// so a site change is a one-file fix.

export type Site = 'usta' | 'utr';

export const siteLabels: Record<Site, string> = { usta: 'USTA', utr: 'UTR' };

export function otherSite(site: Site): Site {
  return site === 'usta' ? 'utr' : 'usta';
}

export function profileUrl(site: Site, id: string): string {
  return site === 'usta' ? ustaProfileUrl(id) : utrProfileUrl(id);
}

/**
 * The given site's player search page, prefilled with the name, when that page actually shows results on arrival.
 * UTR's doesn't: it fills the search box but only shows results after the user interacts, so it would look empty.
 */
export function searchUrl(site: Site, name: string): string | null {
  return site === 'usta' ? ustaSearchUrl(name) : null;
}

/**
 * A page on the given site that the extension opens to finish finding a player there, when that site can't be
 * searched from elsewhere. USTA only: its search API refuses the extension's background worker.
 */
export function handoffUrl(site: Site, name: string): string | null {
  return site === 'usta' ? `${ustaSearchUrl(name)}&${HANDOFF_MARKER}=1` : null;
}

// ---- UTR ----------------------------------------------------------------
// Profiles: https://app.utrsports.net/profiles/{id}. Opens logged out with a minimal view.

export function utrProfileUrl(profileId: string): string {
  return `https://app.utrsports.net/profiles/${encodeURIComponent(profileId)}`;
}

/** Extracts a UTR profile id from a URL path such as /profiles/247320. */
export function utrProfileIdFromPath(pathname: string): string | null {
  return /^\/profiles\/(\d+)/.exec(pathname)?.[1] ?? null;
}

// ---- USTA ---------------------------------------------------------------
// Profiles: https://www.usta.com/en/home/play/player-search/profile.html#uaid={id}&tab=…
// The player id lives in the URL fragment, so in-page navigation changes it without a reload.
// Opens logged out from a direct URL.
// Search: https://www.usta.com/en/home/play/player-search.html#page=1&searchText={name}

const USTA_PROFILE_PATH = '/en/home/play/player-search/profile.html';

const USTA_SEARCH_PATH = '/en/home/play/player-search.html';

/** Marks a USTA search page the extension opened to find a player, so it doesn't act on the user's own searches. */
const HANDOFF_MARKER = 'ustautr';

/** Opens USTA's player search with the name prefilled. */
export function ustaSearchUrl(name: string): string {
  return `https://www.usta.com${USTA_SEARCH_PATH}#page=1&searchText=${encodeURIComponent(name)}`;
}

/** The name to find, when this is a USTA search page the extension opened; otherwise null. */
export function ustaHandoffFromLocation(loc: Pick<Location, 'pathname' | 'hash'>): { name: string } | null {
  if (loc.pathname !== USTA_SEARCH_PATH) return null;
  const params = new URLSearchParams(loc.hash.replace(/^#/, ''));
  const name = params.get('searchText')?.trim();
  return params.has(HANDOFF_MARKER) && name ? { name } : null;
}

export function ustaProfileUrl(uaid: string): string {
  return `https://www.usta.com${USTA_PROFILE_PATH}#uaid=${encodeURIComponent(uaid)}`;
}

/** Extracts a USTA uaid from a profile page location, or null if this isn't a profile page. */
export function ustaUaidFromLocation(loc: Pick<Location, 'pathname' | 'hash'>): string | null {
  if (loc.pathname !== USTA_PROFILE_PATH) return null;
  return new URLSearchParams(loc.hash.replace(/^#/, '')).get('uaid') || null;
}
