export interface MatchRule {
  category: string;
  patterns: RegExp[];
  antiPatterns?: RegExp[];
  confidence: number;
}

export interface MatchResult {
  category: string;
  confidence: number;
  matchedPattern: string;
  tier: 'rule';
}
