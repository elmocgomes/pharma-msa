import type { MatchRule, MatchResult } from './types.js';

export type { MatchRule, MatchResult } from './types.js';

export function matchRules(message: string, rules: MatchRule[]): MatchResult | null {
  const normalized = message.trim();
  let best: MatchResult | null = null;

  for (const rule of rules) {
    if (rule.antiPatterns?.some((ap) => ap.test(normalized))) continue;

    for (const pattern of rule.patterns) {
      if (pattern.test(normalized)) {
        if (!best || rule.confidence > best.confidence) {
          best = {
            category: rule.category,
            confidence: rule.confidence,
            matchedPattern: pattern.source,
            tier: 'rule',
          };
        }
        break;
      }
    }
  }
  return best;
}
