import { describe, expect, it } from 'vitest';
import { decideMatch, nameTokens, type Candidate } from '../utils/matching';

function utr(id: string, name: string): Candidate {
  return { player: { site: 'utr', id, name }, details: '' };
}

describe('name comparison', () => {
  it('ignores case, accents, hyphens and extra spaces', () => {
    expect(nameTokens('  José  Rivera-Stone ')).toEqual(['jose', 'rivera', 'stone']);
  });
});

describe('choosing the match', () => {
  it('picks the one result with the same full name', () => {
    const decision = decideMatch('Alex Rivera-Stone', [utr('1', 'Alex Rivera-Stone'), utr('2', 'Alexis Klein')]);

    expect(decision).toEqual({ kind: 'single', candidate: utr('1', 'Alex Rivera-Stone') });
  });

  it('treats differently punctuated spellings of the same name as the same', () => {
    expect(decideMatch('alex rivera stone', [utr('1', 'Alex Rivera-Stone')]).kind).toBe('single');
  });

  it('asks the user to choose when several results share the full name', () => {
    const decision = decideMatch('Sam Lee', [utr('1', 'Sam Lee'), utr('2', 'Sam Lee'), utr('3', 'Sam Leeds')]);

    expect(decision).toEqual({ kind: 'several', candidates: [utr('1', 'Sam Lee'), utr('2', 'Sam Lee')] });
  });

  it('offers close names when there is no exact match', () => {
    const decision = decideMatch('Sam Rivera', [utr('1', 'Samuel Rivera'), utr('2', 'S. Rivera Stone'), utr('3', 'Sam Klein')]);

    expect(decision).toEqual({ kind: 'several', candidates: [utr('1', 'Samuel Rivera'), utr('2', 'S. Rivera Stone')] });
  });

  it('finds nothing when no result shares the last name', () => {
    expect(decideMatch('Sam Rivera', [utr('1', 'Sam Klein')])).toEqual({ kind: 'none' });
  });

  it('finds nothing for an empty name', () => {
    expect(decideMatch('  ', [utr('1', 'Sam Klein')])).toEqual({ kind: 'none' });
  });
});
