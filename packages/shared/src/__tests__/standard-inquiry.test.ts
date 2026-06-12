import { describe, it, expect } from 'vitest';
import { FlowTreeSchema } from '../schemas.js';
import {
  STANDARD_INQUIRY_TEMPLATE,
  STANDARD_INQUIRY_ENTRY_NODE,
  STANDARD_INQUIRY_METADATA,
} from '../templates/standard-inquiry.js';

describe('Standard Inquiry Template', () => {
  it('validates against FlowTreeSchema', () => {
    const result = FlowTreeSchema.safeParse(STANDARD_INQUIRY_TEMPLATE);
    expect(result.success).toBe(true);
  });

  it('has a valid entry node', () => {
    expect(STANDARD_INQUIRY_TEMPLATE[STANDARD_INQUIRY_ENTRY_NODE]).toBeDefined();
  });

  it('all node references are valid', () => {
    const nodeIds = Object.keys(STANDARD_INQUIRY_TEMPLATE);
    for (const [id, node] of Object.entries(STANDARD_INQUIRY_TEMPLATE)) {
      if (node.type === 'send') {
        expect(nodeIds, `send node "${id}" points to missing "${node.next}"`).toContain(node.next);
      }
      if (node.type === 'classify') {
        for (const branch of node.branches) {
          expect(nodeIds, `classify node "${id}" branch "${branch.category}" points to missing "${branch.next}"`).toContain(branch.next);
        }
        expect(nodeIds, `classify node "${id}" timeout_next points to missing "${node.timeout_next}"`).toContain(node.timeout_next);
      }
      if (node.type === 'next_product') {
        expect(nodeIds, `next_product "${id}" has_more_next missing`).toContain(node.has_more_next);
        expect(nodeIds, `next_product "${id}" done_next missing`).toContain(node.done_next);
      }
    }
  });

  it('has variants on send nodes', () => {
    const sendNodes = Object.values(STANDARD_INQUIRY_TEMPLATE).filter((n) => n.type === 'send');
    const withVariants = sendNodes.filter((n) => n.type === 'send' && n.variants && n.variants.length > 0);
    expect(withVariants.length).toBeGreaterThan(3);
  });

  it('has rulePhase on classify nodes', () => {
    const classifyNodes = Object.values(STANDARD_INQUIRY_TEMPLATE).filter((n) => n.type === 'classify');
    const withRules = classifyNodes.filter((n) => n.type === 'classify' && n.rulePhase);
    expect(withRules.length).toBeGreaterThanOrEqual(3);
  });

  it('has metadata', () => {
    expect(STANDARD_INQUIRY_METADATA.name).toBeTruthy();
    expect(STANDARD_INQUIRY_METADATA.version).toBe(1);
  });

  it('has no dead-end send nodes (all loop back eventually)', () => {
    const visited = new Set<string>();
    function walk(nodeId: string) {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      const node = STANDARD_INQUIRY_TEMPLATE[nodeId];
      if (!node) return;
      if (node.type === 'send') walk(node.next);
      if (node.type === 'classify') {
        node.branches.forEach((b) => walk(b.next));
        walk(node.timeout_next);
      }
      if (node.type === 'next_product') {
        walk(node.has_more_next);
        walk(node.done_next);
      }
    }
    walk(STANDARD_INQUIRY_ENTRY_NODE);
    // All nodes should be reachable
    const allNodes = Object.keys(STANDARD_INQUIRY_TEMPLATE);
    expect(visited.size).toBe(allNodes.length);
  });
});
