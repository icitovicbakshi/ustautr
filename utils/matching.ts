// Decides which search result on the other site is the player on this page.
// Name-based for now; distinguishing details (gender, location, age group) can tighten it once both sites expose them.

import type { Site } from './sites';

/** A player on one site. `name` is a display label only; `id` is the identity. */
export interface PlayerRef {
  site: Site;
  id: string;
  name: string;
}

/** A possible match on the other site. `details` is a short human-readable line to help the user choose. */
export interface Candidate {
  player: PlayerRef;
  details: string;
  /** The rating as the other site shows it to signed-out visitors. */
  rating?: Rating;
}

/**
 * A rating to show beside a candidate: a visible value ("UTR 14.74", or partly masked "UTR 4.xx"), or a muted
 * state when there's no value to show ("UTR hidden", "Unrated"). `note` explains a muted state.
 */
export interface Rating {
  label: string;
  muted?: boolean;
  note?: string;
}

export type MatchDecision =
  | { kind: 'single'; candidate: Candidate }
  | { kind: 'several'; candidates: readonly Candidate[] }
  | { kind: 'none' };

/** The most options shown when the user has to choose. */
export const MAX_CHOICES = 5;

/** Lowercase name tokens with accents and punctuation removed, so "Icitovic-Bakshi" and "icitovic bakshi" compare equal. */
export function nameTokens(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Exactly one result with the same full name is a clear match. Otherwise, results with the same
 * last name and the same first name or initial are offered as choices. Search order is preserved.
 */
export function decideMatch(name: string, candidates: readonly Candidate[]): MatchDecision {
  const target = nameTokens(name);
  if (target.length === 0) return { kind: 'none' };

  const exact = candidates.filter((c) => sameTokens(nameTokens(c.player.name), target));
  const [only] = exact;
  if (exact.length === 1 && only) return { kind: 'single', candidate: only };
  if (exact.length > 1) return { kind: 'several', candidates: exact.slice(0, MAX_CHOICES) };

  const close = candidates.filter((c) => isCloseName(nameTokens(c.player.name), target));
  return close.length > 0 ? { kind: 'several', candidates: close.slice(0, MAX_CHOICES) } : { kind: 'none' };
}

function sameTokens(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((token, i) => token === b[i]);
}

function isCloseName(candidate: string[], target: string[]): boolean {
  const first = target[0];
  const last = target.at(-1);
  if (!first || !last) return false;
  return candidate.includes(last) && candidate[0]?.[0] === first[0];
}
