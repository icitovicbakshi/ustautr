// Messages between content scripts and the background worker, which performs cross-site lookups.
// Content scripts can't call the other site's API directly: the host page's CORS rules apply to them.

import { HttpError } from './http-error';
import type { Candidate } from './matching';

export type LookupRequest =
  | { type: 'utr-search'; query: string }
  | { type: 'utr-player-name'; id: string };

export type LookupReply<T> = { ok: true; value: T } | { ok: false; error: string; status?: number };

export function isLookupRequest(message: unknown): message is LookupRequest {
  const m = message as { type?: unknown; query?: unknown; id?: unknown } | null;
  return (
    (m?.type === 'utr-search' && typeof m.query === 'string') ||
    (m?.type === 'utr-player-name' && typeof m.id === 'string')
  );
}

/** Searches UTR for a player by name, via the background worker. */
export function requestUtrSearch(query: string): Promise<Candidate[]> {
  return send<Candidate[]>({ type: 'utr-search', query });
}

/** Gets a UTR player's name by id, via the background worker. */
export function requestUtrPlayerName(id: string): Promise<string | null> {
  return send<string | null>({ type: 'utr-player-name', id });
}

async function send<T>(request: LookupRequest): Promise<T> {
  const reply = (await browser.runtime.sendMessage(request)) as LookupReply<T> | undefined;
  if (!reply) throw new Error('No reply from the background worker.');
  if (!reply.ok) throw new HttpError(reply.error, reply.status);
  return reply.value;
}
