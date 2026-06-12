import { describe, it, expect, vi } from 'vitest';
import { TieredClassifier } from '../classifier.js';
import type { ClassifyNode } from '@pharma/shared';

// Mock NavigatorAgent
function createMockNavigator(
  result?: Partial<{
    category: string;
    confidence: number;
    reasoning: string;
    is_personal_question: boolean;
  }>,
) {
  return {
    classify: vi.fn().mockResolvedValue({
      category: result?.category ?? 'available',
      confidence: result?.confidence ?? 0.9,
      reasoning: result?.reasoning ?? 'test reasoning',
      is_personal_question: result?.is_personal_question ?? false,
    }),
  } as any;
}

const baseNode: ClassifyNode = {
  type: 'classify',
  id: 'wait_availability',
  intent: 'Check if pharmacy has the product',
  branches: [
    { category: 'available', description: 'Product is available', next: 'ask_price' },
    { category: 'unavailable', description: 'Product not available', next: 'ask_alt' },
  ],
  timeout_ms: 300000,
  timeout_next: 'timeout',
  max_retries: 2,
};

const persona = { name: 'Maria Silva', cpf: '123.456.789-00', neighborhood: 'Copacabana', age: 35 };
const history: { role: 'user' | 'assistant'; content: string }[] = [];

describe('TieredClassifier', () => {
  describe('Tier 0: Personal questions', () => {
    it('detects name question and returns preset response', async () => {
      const classifier = new TieredClassifier(createMockNavigator());
      const result = await classifier.classify({
        message: 'Qual seu nome?',
        node: baseNode,
        conversationHistory: history,
        persona,
      });
      expect(result.tier).toBe('personal');
      expect(result.personalResponse).toContain('Maria Silva');
      expect(result.confidence).toBe(1.0);
    });

    it('does not call navigator for personal questions', async () => {
      const nav = createMockNavigator();
      const classifier = new TieredClassifier(nav);
      await classifier.classify({
        message: 'Qual seu nome?',
        node: baseNode,
        conversationHistory: history,
        persona,
      });
      expect(nav.classify).not.toHaveBeenCalled();
    });
  });

  describe('Tier 1: Rule-based', () => {
    it('matches rule when rulePhase is set', async () => {
      const nav = createMockNavigator();
      const nodeWithRules = { ...baseNode, rulePhase: 'availability' };
      const classifier = new TieredClassifier(nav);
      const result = await classifier.classify({
        message: 'Temos sim, pode vir buscar',
        node: nodeWithRules,
        conversationHistory: history,
        persona,
      });
      expect(result.tier).toBe('rule');
      expect(result.category).toBe('available');
      expect(nav.classify).not.toHaveBeenCalled();
    });

    it('matches custom rules', async () => {
      const nav = createMockNavigator();
      const nodeWithCustom = {
        ...baseNode,
        customRules: [
          {
            category: 'available',
            patterns: ['\\bpode\\s+levar\\b'],
            confidence: 0.95,
          },
        ],
      };
      const classifier = new TieredClassifier(nav);
      const result = await classifier.classify({
        message: 'Pode levar!',
        node: nodeWithCustom,
        conversationHistory: history,
        persona,
      });
      expect(result.tier).toBe('rule');
      expect(result.category).toBe('available');
    });

    it('falls through to navigator if rule category does not match branches', async () => {
      const nav = createMockNavigator();
      const nodeWithRules = {
        ...baseNode,
        rulePhase: 'price', // price rules won't match 'available'/'unavailable' branches
      };
      const classifier = new TieredClassifier(nav);
      const result = await classifier.classify({
        message: 'R$ 45,90',
        node: nodeWithRules,
        conversationHistory: history,
        persona,
      });
      // price_given doesn't match any branch, so falls through to navigator
      expect(result.tier).toBe('navigator');
      expect(nav.classify).toHaveBeenCalled();
    });
  });

  describe('Tier 2: Navigator', () => {
    it('uses navigator when no rules match', async () => {
      const nav = createMockNavigator({ category: 'available', confidence: 0.85 });
      const classifier = new TieredClassifier(nav);
      const result = await classifier.classify({
        message: 'Olha, acho que chegou ontem esse lote novo',
        node: baseNode,
        conversationHistory: history,
        persona,
      });
      expect(result.tier).toBe('navigator');
      expect(result.category).toBe('available');
    });
  });

  describe('Tier 3: Recovery', () => {
    it('flags recovery when navigator confidence is low', async () => {
      const nav = createMockNavigator({ confidence: 0.2, reasoning: 'Ambiguous response' });
      const classifier = new TieredClassifier(nav);
      const result = await classifier.classify({
        message: 'Hmm, deixa eu verificar aqui',
        node: baseNode,
        conversationHistory: history,
        persona,
      });
      expect(result.tier).toBe('recovery');
      expect(result.category).toBeNull();
    });

    it('flags recovery when navigator detects personal question it missed', async () => {
      const nav = createMockNavigator({
        confidence: 0.7,
        is_personal_question: true,
        reasoning: 'Pharmacy asking subtle personal question',
      });
      const classifier = new TieredClassifier(nav);
      // Use a message that Tier 0 won't catch but navigator flags as personal
      const result = await classifier.classify({
        message: 'Você é daqui da região mesmo?',
        node: baseNode,
        conversationHistory: history,
        persona,
      });
      expect(result.tier).toBe('recovery');
    });
  });

  describe('Tier priority', () => {
    it('personal > rule > navigator', async () => {
      const nav = createMockNavigator();
      // "Qual seu nome?" is personal AND would match some rules
      const nodeWithRules = { ...baseNode, rulePhase: 'availability' };
      const classifier = new TieredClassifier(nav);
      const result = await classifier.classify({
        message: 'Qual seu nome?',
        node: nodeWithRules,
        conversationHistory: history,
        persona,
      });
      expect(result.tier).toBe('personal');
    });
  });
});

