import { describe, it, expect } from 'vitest';
import { matchRules, type MatchRule } from '../rules/matcher.js';

const AVAILABILITY_RULES: MatchRule[] = [
  {
    category: 'available',
    patterns: [/\btem\s+sim\b/i, /\btemos\b/i, /\bdispon[ií]vel/i, /\bem\s+estoque\b/i],
    antiPatterns: [/\bn[ãa]o\b/i, /\bfalta\b/i],
    confidence: 0.9,
  },
  {
    category: 'unavailable',
    patterns: [/\bn[ãa]o\s+tem(os)?\b/i, /\bacabou\b/i, /\bem\s+falta\b/i, /\bestamos\s+sem\b/i],
    confidence: 0.9,
  },
];

describe('matchRules', () => {
  it('matches "temos sim" as available', () => {
    const result = matchRules('Temos sim, pode vir buscar', AVAILABILITY_RULES);
    expect(result).not.toBeNull();
    expect(result!.category).toBe('available');
    expect(result!.confidence).toBe(0.9);
  });

  it('matches "não temos" as unavailable', () => {
    const result = matchRules('Não temos esse no momento', AVAILABILITY_RULES);
    expect(result).not.toBeNull();
    expect(result!.category).toBe('unavailable');
  });

  it('anti-pattern blocks false positive', () => {
    const result = matchRules('Não, temos outro similar', AVAILABILITY_RULES);
    expect(result?.category).not.toBe('available');
  });

  it('returns null for unrecognized messages', () => {
    expect(matchRules('Boa tarde, como posso ajudar?', AVAILABILITY_RULES)).toBeNull();
  });

  it('returns highest confidence match', () => {
    const rules: MatchRule[] = [
      { category: 'a', patterns: [/sim/i], confidence: 0.7 },
      { category: 'b', patterns: [/sim/i], confidence: 0.9 },
    ];
    expect(matchRules('sim', rules)!.category).toBe('b');
  });

  it('handles accented characters', () => {
    const result = matchRules('Está disponível sim', AVAILABILITY_RULES);
    expect(result!.category).toBe('available');
  });
});
