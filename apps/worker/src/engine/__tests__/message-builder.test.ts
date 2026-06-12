import { describe, it, expect } from 'vitest';
import { interpolateMessage, selectMessage } from '../message-builder.js';

describe('interpolateMessage', () => {
  it('replaces variables', () => {
    expect(interpolateMessage('Olá, tem {product_name}?', { product_name: 'Rivotril' }))
      .toBe('Olá, tem Rivotril?');
  });

  it('warns but preserves missing variables', () => {
    expect(interpolateMessage('{unknown} test', {})).toBe('{unknown} test');
  });

  it('replaces multiple variables', () => {
    expect(interpolateMessage('{name} {dosage}', { name: 'Rivotril', dosage: '2mg' }))
      .toBe('Rivotril 2mg');
  });
});

describe('selectMessage', () => {
  const msg = 'Olá, boa tarde!';
  const variants = ['Oi, tudo bem?', 'Boa tarde!', 'Olá!'];

  it('returns message when no variants', () => {
    expect(selectMessage(msg, undefined, 'conv1', 'node1')).toBe(msg);
    expect(selectMessage(msg, [], 'conv1', 'node1')).toBe(msg);
  });

  it('is deterministic for same conv+node', () => {
    const r1 = selectMessage(msg, variants, 'conv-abc', 'greeting');
    const r2 = selectMessage(msg, variants, 'conv-abc', 'greeting');
    expect(r1).toBe(r2);
  });

  it('varies across different conversations', () => {
    const results = new Set<string>();
    for (let i = 0; i < 20; i++) {
      results.add(selectMessage(msg, variants, `conv-${i}`, 'greeting'));
    }
    // With 4 options and 20 different conversations, we should see at least 2 distinct
    expect(results.size).toBeGreaterThan(1);
  });

  it('always returns a valid option', () => {
    const options = [msg, ...variants];
    for (let i = 0; i < 50; i++) {
      const result = selectMessage(msg, variants, `conv-${i}`, `node-${i}`);
      expect(options).toContain(result);
    }
  });
});
