import { describe, expect, it } from 'vitest';
import type { Candidate } from '../utils/matching';
import { chooseView, type ViewInput } from '../utils/lookup-controller';

const alexOnUtr: Candidate = { player: { site: 'utr', id: '1001', name: 'Alex Rivera' }, details: 'Austin, TX' };
const otherAlexOnUtr: Candidate = { player: { site: 'utr', id: '1002', name: 'Alex Rivera' }, details: 'Miami, FL' };
const both = [alexOnUtr, otherAlexOnUtr];

function view(overrides: Partial<ViewInput>) {
  return chooseView({ canSearch: true, lookup: { status: 'ready' }, showAlternatives: false, ...overrides });
}

describe('what a profile page offers', () => {
  it('offers the player found on the other site, one click away', () => {
    const lookup = { status: 'done', decision: { kind: 'single', candidate: alexOnUtr }, candidates: both, byUser: false } as const;

    expect(view({ lookup })).toEqual({ kind: 'match', candidate: alexOnUtr });
  });

  it('shows progress while searching', () => {
    expect(view({ lookup: { status: 'loading' } }).kind).toBe('looking');
  });

  it('lists every result when the user says the offered player is wrong', () => {
    const lookup = { status: 'done', decision: { kind: 'single', candidate: alexOnUtr }, candidates: both, byUser: false } as const;

    expect(view({ lookup, showAlternatives: true })).toEqual({ kind: 'choose', candidates: both });
  });

  it('lets the user pick when several people could be the player', () => {
    const lookup = { status: 'done', decision: { kind: 'several', candidates: both }, candidates: both, byUser: false } as const;

    expect(view({ lookup }).kind).toBe('choose');
  });

  it('says so when nobody was found', () => {
    const lookup = { status: 'done', decision: { kind: 'none' }, candidates: [], byUser: false } as const;

    expect(view({ lookup })).toEqual({ kind: 'retry', problem: 'no-results' });
  });

  it('does not list unrelated people when an automatic search finds no matching name', () => {
    const lookup = { status: 'done', decision: { kind: 'none' }, candidates: both, byUser: false } as const;

    expect(view({ lookup })).toEqual({ kind: 'retry', problem: 'no-results' });
  });

  it('shows every result when the user searched a name themselves', () => {
    const lookup = { status: 'done', decision: { kind: 'none' }, candidates: both, byUser: true } as const;

    expect(view({ lookup })).toEqual({ kind: 'choose', candidates: both });
  });

  it('says so when the other site could not be reached', () => {
    expect(view({ lookup: { status: 'failed', refused: false } })).toEqual({ kind: 'retry', problem: 'failed' });
  });

  it('says so when the other site refused an automatic search', () => {
    expect(view({ lookup: { status: 'failed', refused: true } })).toEqual({ kind: 'retry', problem: 'refused' });
  });

  it('reads the name first, then waits for the user to ask for a search', () => {
    expect(view({ lookup: { status: 'reading' } }).kind).toBe('reading');
    expect(view({ lookup: { status: 'ready' } }).kind).toBe('ready');
  });

  it('asks for the name when the page never showed one', () => {
    expect(view({ lookup: { status: 'no-name' } })).toEqual({ kind: 'retry' });
  });

  it('offers a search of the other site when it cannot be searched automatically', () => {
    expect(view({ canSearch: false }).kind).toBe('manual');
  });
});
