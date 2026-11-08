import { describe, expect, it, vi } from 'vitest';
import { HttpError, isRefused } from '../utils/http-error';
import { fetchUstaPlayerName, parseUstaPlayerName, parseUstaSearch, searchUstaPlayers, ustaSearchBody } from '../utils/usta-api';

const response = {
  data: [
    {
      name: 'Alex Rivera-Stone',
      uaid: '2000000001',
      city: 'ESCONDIDO',
      state: 'CA',
      section: { code: '65', name: 'Southern California' },
      district: { code: '18', name: 'San Diego', sectionCode: '65' },
    },
    { name: 'Sam Rivera', uaid: '900000002', city: null, state: null, section: { code: '30', name: 'Mid-Atlantic' } },
    { name: 'No Id', uaid: null },
  ],
  pagination: { currentPage: 1, pageSize: 10, totalPages: 1, totalResults: 3 },
};

describe('USTA search request', () => {
  it('splits the name into first name and the rest as last name', () => {
    expect(ustaSearchBody('  Alex  Rivera-Stone ')).toEqual({
      pagination: { pageSize: '10', currentPage: '1' },
      selection: { name: { fname: 'Alex', lname: 'Rivera-Stone' } },
    });
    expect(ustaSearchBody('Mary Ann Rivera').selection.name).toEqual({ fname: 'Mary', lname: 'Ann Rivera' });
  });
});

describe('USTA search results', () => {
  it('turns results into candidates with location and section as details', () => {
    expect(parseUstaSearch(response)[0]).toEqual({
      player: { site: 'usta', id: '2000000001', name: 'Alex Rivera-Stone' },
      details: 'Escondido, CA · Southern California',
    });
  });

  it('copes with missing location and skips results without an id', () => {
    expect(parseUstaSearch(response).map((c) => c.details)).toEqual(['Escondido, CA · Southern California', 'Mid-Atlantic']);
  });

  it('copes with an empty or unexpected response', () => {
    expect(parseUstaSearch({})).toEqual([]);
    expect(parseUstaSearch(null)).toEqual([]);
  });
});

describe('calling USTA', () => {
  it('posts the search without cookies', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(response)));

    const candidates = await searchUstaPlayers('Alex Rivera-Stone', fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(
      'https://services.usta.com/v1/dataexchange/profile/search/public',
      expect.objectContaining({ method: 'POST', credentials: 'omit', body: JSON.stringify(ustaSearchBody('Alex Rivera-Stone')) }),
    );
    expect(candidates).toHaveLength(2);
  });

  it('reports a refused search with its status, so the panel can say so', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 403 }));

    const error = await searchUstaPlayers('Alex Rivera', fetchFn).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(isRefused(error)).toBe(true);
  });
});

describe('USTA player info', () => {
  it('reads the name the profile page shows', async () => {
    const info = { data: [{ name: ' Alex Rivera-Stone ', uaid: '2000000001', ageCategory: 'JUNIOR' }] };
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(info)));

    expect(await fetchUstaPlayerName('2000000001', fetchFn)).toBe('Alex Rivera-Stone');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://www.usta.com/usta/api?type=playerInfo',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ selection: { uaid: '2000000001' } }) }),
    );
  });

  it('has no name when the response has no player', () => {
    expect(parseUstaPlayerName({ data: [] })).toBeNull();
    expect(parseUstaPlayerName(null)).toBeNull();
  });

  it('reports a failed call so the page can be read instead', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 500 }));

    await expect(fetchUstaPlayerName('2000000001', fetchFn)).rejects.toThrow('500');
  });
});
