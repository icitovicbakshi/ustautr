import { describe, expect, it, vi } from 'vitest';
import searchResponse from './fixtures/utr-search.json';
import { fetchUtrPlayerName, parseUtrProfileName, parseUtrSearch, searchUtrPlayers, utrSearchApiUrl } from '../utils/utr-api';

describe('UTR search results', () => {
  it('turns hits into candidates with a trimmed name, a short details line and the rating as UTR shows it', () => {
    expect(parseUtrSearch(searchResponse)[0]).toEqual({
      player: { site: 'utr', id: '1001', name: 'Alex Rivera-Stone' },
      details: 'Austin, TX · U13 · Male',
      rating: { label: 'UTR 4.xx' },
    });
    expect(parseUtrSearch(searchResponse)[1]?.rating).toEqual({ label: 'UTR 15.30' });
  });

  it('says when UTR hides a rated player’s rating, and when a player is unrated', () => {
    const hit = (source: object) => ({ players: { hits: [{ source: { id: 1, displayName: 'Sam Lee', ...source } }] } });

    expect(parseUtrSearch(hit({ singlesUtrDisplay: '0.xx', ratingStatusSingles: 'Rated' }))[0]?.rating).toMatchObject({
      label: 'UTR hidden',
      muted: true,
    });
    expect(parseUtrSearch(hit({ singlesUtrDisplay: '3.50', ratingStatusSingles: 'Unrated' }))[0]?.rating).toMatchObject({
      label: 'Unrated',
      muted: true,
    });
    expect(parseUtrSearch(hit({ singlesUtrDisplay: '0.00' }))[0]?.rating).toBeUndefined();
  });

  it('falls back to the display name and omits missing details', () => {
    expect(parseUtrSearch(searchResponse)[2]).toEqual({
      player: { site: 'utr', id: '1003', name: 'Sam Rivera' },
      details: '',
    });
  });

  it('skips hits without a player and keeps search order', () => {
    expect(parseUtrSearch(searchResponse).map((c) => c.player.id)).toEqual(['1001', '1002', '1003']);
  });

  it('copes with an empty or unexpected response', () => {
    expect(parseUtrSearch({})).toEqual([]);
    expect(parseUtrSearch(null)).toEqual([]);
  });
});

describe('calling UTR', () => {
  it('searches signed out, without cookies', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(searchResponse)));

    const candidates = await searchUtrPlayers('Alex Rivera-Stone', fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(utrSearchApiUrl('Alex Rivera-Stone'), expect.objectContaining({ credentials: 'omit' }));
    expect(candidates).toHaveLength(3);
  });

  it('reports a failed search', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 503 }));

    await expect(searchUtrPlayers('Alex', fetchFn)).rejects.toThrow('503');
  });

  it('reads the player name from a profile', async () => {
    const profile = { id: 1001, playerFirstName: 'Alex', playerLastName: 'Rivera-Stone', displayName: 'Alex Rivera-Stone ' };
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(profile)));

    expect(await fetchUtrPlayerName('1001', fetchFn)).toBe('Alex Rivera-Stone');
    expect(parseUtrProfileName({ displayName: ' Sam Rivera ' })).toBe('Sam Rivera');
    expect(parseUtrProfileName({})).toBeNull();
  });
});
