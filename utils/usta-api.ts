// USTA's player search. USTA refuses (403) calls from the extension's background worker, so it is called from
// content scripts running on USTA's own pages, where the request comes from USTA's site like the page's own.
// The extension never reads or forges credentials or headers.

import { diag, shapeOf } from './diagnostics';
import { HttpError } from './http-error';
import type { Candidate } from './matching';

/** Give up on a slow site rather than leave the panel searching forever. */
const REQUEST_TIMEOUT_MS = 10_000;

const USTA_SEARCH_API = 'https://services.usta.com/v1/dataexchange/profile/search/public';

/** How many results to ask for. A person's name rarely needs more. */
const PAGE_SIZE = 10;

/** The subset of USTA's search response we read. Everything else is ignored. */
interface UstaSearchResponse {
  data?: UstaPlayer[] | null;
}

interface UstaPlayer {
  name?: string | null;
  uaid?: string | null;
  city?: string | null;
  state?: string | null;
  section?: { name?: string | null } | null;
}

/** USTA searches by first and last name separately; everything after the first word is treated as the last name. */
export function ustaSearchBody(name: string) {
  const [fname = '', ...rest] = name.trim().split(/\s+/);
  return {
    pagination: { pageSize: String(PAGE_SIZE), currentPage: '1' },
    selection: { name: { fname, lname: rest.join(' ') } },
  };
}

/** Turns a USTA search response into candidates, keeping only what's needed to choose and link. */
export function parseUstaSearch(body: unknown): Candidate[] {
  const players = (body as UstaSearchResponse | null)?.data ?? [];
  return players.flatMap((p) => {
    const name = p.name?.trim();
    if (!p.uaid || !name) return [];
    const place = [p.city && tidyCase(p.city.trim()), p.state?.trim()].filter(Boolean).join(', ');
    const details = [place, p.section?.name?.trim()].filter(Boolean).join(' · ');
    return [{ player: { site: 'usta' as const, id: p.uaid, name }, details }];
  });
}

export async function searchUstaPlayers(name: string, fetchFn: typeof fetch = fetch): Promise<Candidate[]> {
  const response = await fetchFn(USTA_SEARCH_API, {
    method: 'POST',
    credentials: 'omit',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(ustaSearchBody(name)),
  });
  diag('USTA search response', { status: response.status });
  if (!response.ok) throw new HttpError(`USTA search failed with status ${response.status}`, response.status);
  return parseUstaSearch(await response.json());
}

// The profile page's own player-info call, served by www.usta.com. Called from the USTA page itself, so it's a
// same-origin request like the page's own. Found in the page markup: <v-api-caller endpoint="/usta/api?type=playerInfo"
// security-type="public"> with the uaid from the URL fragment as selection.uaid.
const USTA_PLAYER_INFO_API = 'https://www.usta.com/usta/api?type=playerInfo';

/** The player's name from a player-info response (the page renders it from data[0].name). */
export function parseUstaPlayerName(body: unknown): string | null {
  return (body as UstaSearchResponse | null)?.data?.[0]?.name?.trim() || null;
}

export async function fetchUstaPlayerName(uaid: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  const response = await fetchFn(USTA_PLAYER_INFO_API, {
    method: 'POST',
    credentials: 'same-origin',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ selection: { uaid } }),
  });
  diag('USTA player info response', { status: response.status, contentType: response.headers.get('content-type') });
  if (!response.ok) throw new HttpError(`USTA player info failed with status ${response.status}`, response.status);
  const body: unknown = await response.json();
  diag('USTA player info shape', { top: shapeOf(body), data: shapeOf((body as { data?: unknown } | null)?.data) });
  return parseUstaPlayerName(body);
}

/** "ESCONDIDO" → "Escondido". Leaves mixed-case text alone. */
function tidyCase(text: string): string {
  return text === text.toUpperCase() ? text.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : text;
}
