// UTR's player search, called signed out: no cookies, no token. Runs in the background worker,
// because the extension's host permission for api.utrsports.net applies there and not in content scripts.

import { HttpError } from './http-error';
import type { Candidate, Rating } from './matching';

/** Give up on a slow site rather than leave the panel searching forever. */
const REQUEST_TIMEOUT_MS = 10_000;

const UTR_API = 'https://api.utrsports.net';

/** The subset of UTR's search response we read. Everything else is ignored. */
interface UtrSearchResponse {
  players?: { hits?: { source?: UtrPlayerSource | null }[] | null } | null;
}

interface UtrPlayerSource {
  id?: number | null;
  playerFirstName?: string | null;
  playerLastName?: string | null;
  displayName?: string | null;
  gender?: string | null;
  ageRange?: string | null;
  location?: { display?: string | null } | null;
  singlesUtrDisplay?: string | null;
  myUtrSinglesDisplay?: string | null;
  ratingStatusSingles?: string | null;
}

export function utrSearchApiUrl(query: string): string {
  return `${UTR_API}/v2/search?schoolClubSearch=true&query=${encodeURIComponent(query)}&top=10&skip=0`;
}

/** Turns a UTR search response into candidates, keeping only what's needed to choose and link. */
export function parseUtrSearch(body: unknown): Candidate[] {
  const hits = (body as UtrSearchResponse | null)?.players?.hits ?? [];
  return hits.flatMap(({ source }) => {
    if (!source?.id) return [];
    const name =
      [source.playerFirstName, source.playerLastName].map((part) => part?.trim()).filter(Boolean).join(' ') ||
      source.displayName?.trim() ||
      '';
    if (!name) return [];
    const details = [source.location?.display, source.ageRange, source.gender].filter(Boolean).join(' · ');
    const rating = utrRating(source);
    return [{ player: { site: 'utr' as const, id: String(source.id), name }, details, ...(rating ? { rating } : {}) }];
  });
}

/**
 * The singles rating exactly as UTR displays it to a signed-out visitor: "14.74", or partly masked like "4.xx".
 * UTR blanks some rated players' ratings entirely ("0.xx"), often younger juniors; that is shown as "UTR hidden",
 * never worked around.
 */
function utrRating(source: UtrPlayerSource): Rating | undefined {
  const status = source.ratingStatusSingles;
  const shown = (source.singlesUtrDisplay || source.myUtrSinglesDisplay)?.trim();
  const blank = !shown || /^0\.(0+|x+)$/i.test(shown);
  if (status === 'Unrated') return { label: 'Unrated', muted: true, note: 'No UTR singles rating yet' };
  if (blank && status === 'Rated') {
    return {
      label: 'UTR hidden',
      muted: true,
      note: 'UTR doesn’t show this player’s rating publicly (often the case for younger juniors)',
    };
  }
  if (blank) return undefined;
  return { label: `UTR ${shown}` };
}

export function utrProfileApiUrl(id: string): string {
  return `${UTR_API}/v1/player/${encodeURIComponent(id)}/profile`;
}

/** The player's display name from a UTR profile response. */
export function parseUtrProfileName(body: unknown): string | null {
  const source = body as UtrPlayerSource | null;
  const name =
    [source?.playerFirstName, source?.playerLastName].map((part) => part?.trim()).filter(Boolean).join(' ') ||
    source?.displayName?.trim();
  return name || null;
}

export async function fetchUtrPlayerName(id: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  const response = await fetchFn(utrProfileApiUrl(id), {
    credentials: 'omit',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new HttpError(`UTR profile failed with status ${response.status}`, response.status);
  return parseUtrProfileName(await response.json());
}

export async function searchUtrPlayers(query: string, fetchFn: typeof fetch = fetch): Promise<Candidate[]> {
  const response = await fetchFn(utrSearchApiUrl(query), {
    credentials: 'omit',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new HttpError(`UTR search failed with status ${response.status}`, response.status);
  return parseUtrSearch(await response.json());
}
