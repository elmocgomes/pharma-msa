import { describe, it, expect } from 'vitest';
import { SendNodeSchema, ClassifyNodeSchema, FlowTreeSchema } from '../schemas.js';

describe('SendNode variants', () => {
  it('parses without variants (backwards-compat)', () => {
    const node = SendNodeSchema.parse({
      type: 'send', id: 'g', message: 'Olá!', next: 'wait',
    });
    expect(node.variants).toBeUndefined();
  });

  it('parses with variants', () => {
    const node = SendNodeSchema.parse({
      type: 'send', id: 'g', message: 'Olá!',
      variants: ['Oi, boa tarde!', 'Boa tarde, tudo bem?'],
      next: 'wait',
    });
    expect(node.variants).toHaveLength(2);
  });
});

describe('ClassifyNode rule overrides', () => {
  it('parses without rules (backwards-compat)', () => {
    const node = ClassifyNodeSchema.parse({
      type: 'classify', id: 'w', intent: 'check availability',
      branches: [{ category: 'available', description: 'Has it', next: 'price' }],
      timeout_next: 'timeout',
    });
    expect(node.rulePhase).toBeUndefined();
    expect(node.customRules).toBeUndefined();
  });

  it('parses with rulePhase', () => {
    const node = ClassifyNodeSchema.parse({
      type: 'classify', id: 'w', intent: 'check availability',
      branches: [{ category: 'available', description: 'Has it', next: 'price' }],
      rulePhase: 'availability',
      timeout_next: 'timeout',
    });
    expect(node.rulePhase).toBe('availability');
  });

  it('parses with customRules', () => {
    const node = ClassifyNodeSchema.parse({
      type: 'classify', id: 'w', intent: 'check availability',
      branches: [{ category: 'available', description: 'Has it', next: 'price' }],
      customRules: [{
        category: 'available',
        patterns: ['\\btem\\s+sim\\b', '\\btemos\\b'],
        confidence: 0.9,
      }],
      timeout_next: 'timeout',
    });
    expect(node.customRules).toHaveLength(1);
    expect(node.customRules![0]!.patterns).toHaveLength(2);
  });

  it('works inside FlowTree', () => {
    const tree = FlowTreeSchema.parse({
      greeting: {
        type: 'send', id: 'greeting', message: 'Olá!',
        variants: ['Oi!', 'Boa tarde!'],
        next: 'wait',
      },
      wait: {
        type: 'classify', id: 'wait', intent: 'availability',
        branches: [{ category: 'available', description: 'yes', next: 'done' }],
        rulePhase: 'availability',
        timeout_next: 'done',
      },
      done: { type: 'complete', id: 'done' },
    });
    expect(Object.keys(tree)).toHaveLength(3);
  });
});
