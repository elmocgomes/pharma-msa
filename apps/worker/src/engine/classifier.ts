import type { LlmMessage } from '@pharma/ai';
import type { NavigatorAgent } from '@pharma/ai';
import type { ClassifyNode } from '@pharma/shared';
import {
  matchRules,
  PHARMACY_RULES,
  type PharmacyRulePhase,
  type MatchRule,
  detectPersonalQuestion,
  buildPersonalResponse,
  type Persona,
} from '@pharma/shared';

export type ClassificationTier = 'personal' | 'rule' | 'navigator' | 'recovery';

export interface ClassificationResult {
  tier: ClassificationTier;
  category: string | null;
  confidence: number;
  reasoning: string;
  personalResponse?: string; // preset text when tier='personal'
  navigatorResult?: { reasoning: string; is_personal_question: boolean };
}

const CONFIDENCE_THRESHOLD = 0.4;

export class TieredClassifier {
  constructor(private navigator: NavigatorAgent) {}

  async classify(opts: {
    message: string;
    node: ClassifyNode;
    conversationHistory: LlmMessage[];
    persona: Persona;
  }): Promise<ClassificationResult> {
    const { message, node, conversationHistory, persona } = opts;

    // ── Tier 0: Personal question ──
    const personalType = detectPersonalQuestion(message);
    if (personalType) {
      return {
        tier: 'personal',
        category: null,
        confidence: 1.0,
        reasoning: `Detected personal question: ${personalType}`,
        personalResponse: buildPersonalResponse(personalType, persona),
      };
    }

    // ── Tier 1: Rule-based matching ──
    const rules = this.buildRuleSet(node);
    if (rules.length > 0) {
      const ruleResult = matchRules(message, rules);
      if (ruleResult) {
        // Only accept if the category maps to a valid branch
        const branch = node.branches.find((b) => b.category === ruleResult.category);
        if (branch) {
          return {
            tier: 'rule',
            category: ruleResult.category,
            confidence: ruleResult.confidence,
            reasoning: `Rule match: ${ruleResult.matchedPattern}`,
          };
        }
      }
    }

    // ── Tier 2: Navigator (AI classification) ──
    const navResult = await this.navigator.classify({
      pharmacyMessage: message,
      conversationHistory,
      intent: node.intent,
      branches: node.branches,
    });

    if (navResult.confidence >= CONFIDENCE_THRESHOLD && !navResult.is_personal_question) {
      const branch = node.branches.find((b) => b.category === navResult.category);
      if (branch) {
        return {
          tier: 'navigator',
          category: navResult.category,
          confidence: navResult.confidence,
          reasoning: navResult.reasoning,
          navigatorResult: {
            reasoning: navResult.reasoning,
            is_personal_question: navResult.is_personal_question,
          },
        };
      }
    }

    // ── Tier 3: Recovery needed ──
    return {
      tier: 'recovery',
      category: null,
      confidence: navResult.confidence,
      reasoning: navResult.is_personal_question
        ? 'Navigator detected personal question (missed by Tier 0)'
        : `Low confidence classification: ${navResult.reasoning}`,
      navigatorResult: {
        reasoning: navResult.reasoning,
        is_personal_question: navResult.is_personal_question,
      },
    };
  }

  private buildRuleSet(node: ClassifyNode): MatchRule[] {
    const rules: MatchRule[] = [];

    // Add pharmacy rules by phase
    if (node.rulePhase) {
      const phase = node.rulePhase as PharmacyRulePhase;
      const phaseRules = PHARMACY_RULES[phase];
      if (phaseRules) {
        rules.push(...phaseRules);
      }
    }

    // Add custom rules (patterns are serialized as strings in JSON)
    if (node.customRules) {
      for (const cr of node.customRules) {
        rules.push({
          category: cr.category,
          patterns: cr.patterns.map((p) => new RegExp(p, 'i')),
          antiPatterns: cr.antiPatterns?.map((p) => new RegExp(p, 'i')),
          confidence: cr.confidence,
        });
      }
    }

    return rules;
  }
}
