import { describe, expect, it } from 'vitest';
import { handoffUrl, searchUrl, ustaHandoffFromLocation, ustaProfileUrl, ustaUaidFromLocation, utrProfileIdFromPath, utrProfileUrl } from '../utils/sites';

describe('UTR profile URLs', () => {
  it('reads the profile id from a profile path', () => {
    expect(utrProfileIdFromPath('/profiles/247320')).toBe('247320');
    expect(utrProfileIdFromPath('/profiles/247320/results')).toBe('247320');
  });

  it('ignores pages that are not profiles', () => {
    expect(utrProfileIdFromPath('/search')).toBeNull();
    expect(utrProfileIdFromPath('/')).toBeNull();
  });

  it('builds a profile link', () => {
    expect(utrProfileUrl('247320')).toBe('https://app.utrsports.net/profiles/247320');
  });
});

describe('USTA profile URLs', () => {
  const profilePath = '/en/home/play/player-search/profile.html';

  it('reads the uaid from the URL fragment', () => {
    expect(ustaUaidFromLocation({ pathname: profilePath, hash: '#uaid=2019726203&tab=tournaments' })).toBe('2019726203');
  });

  it('ignores other pages and profiles without a uaid', () => {
    expect(ustaUaidFromLocation({ pathname: '/en/home.html', hash: '#uaid=2019726203' })).toBeNull();
    expect(ustaUaidFromLocation({ pathname: profilePath, hash: '#tab=tournaments' })).toBeNull();
    expect(ustaUaidFromLocation({ pathname: profilePath, hash: '' })).toBeNull();
  });

  it('builds a profile link', () => {
    expect(ustaProfileUrl('2019726203')).toBe(
      'https://www.usta.com/en/home/play/player-search/profile.html#uaid=2019726203',
    );
  });
});

describe('search links', () => {
  it('does not link to UTR search, whose page shows no results until the user interacts', () => {
    expect(searchUrl('utr', 'Coco Gauff')).toBeNull();
  });

  it('carries the name in the USTA search URL fragment', () => {
    expect(searchUrl('usta', 'Coco Gauff')).toBe(
      'https://www.usta.com/en/home/play/player-search.html#page=1&searchText=Coco%20Gauff',
    );
  });
});

describe('finding a player on USTA from UTR', () => {
  const searchPath = '/en/home/play/player-search.html';

  it('opens USTA search with the name and a marker', () => {
    expect(handoffUrl('usta', 'Alex Rivera')).toBe(
      'https://www.usta.com/en/home/play/player-search.html#page=1&searchText=Alex%20Rivera&ustautr=1',
    );
    expect(handoffUrl('utr', 'Alex Rivera')).toBeNull();
  });

  it('recognises the page it opened and reads the name back', () => {
    const url = new URL(handoffUrl('usta', 'Alex Rivera-Stone')!);

    expect(ustaHandoffFromLocation({ pathname: url.pathname, hash: url.hash })).toEqual({ name: 'Alex Rivera-Stone' });
  });

  it('leaves the user’s own USTA searches alone', () => {
    expect(ustaHandoffFromLocation({ pathname: searchPath, hash: '#page=1&searchText=Alex%20Rivera' })).toBeNull();
    expect(ustaHandoffFromLocation({ pathname: '/en/home.html', hash: '#searchText=Alex&ustautr=1' })).toBeNull();
    expect(ustaHandoffFromLocation({ pathname: searchPath, hash: '#ustautr=1' })).toBeNull();
  });
});
