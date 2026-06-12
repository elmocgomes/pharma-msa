export function interpolateMessage(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = variables[key];
    if (value === undefined) {
      console.warn(`[MESSAGE_BUILDER] Missing variable: ${key}`);
      return match;
    }
    return value;
  });
}

/**
 * Deterministic variant selection using a simple string hash.
 * Same conversationId + nodeId always picks the same variant.
 */
export function selectMessage(
  message: string,
  variants: string[] | undefined,
  conversationId: string,
  nodeId: string,
): string {
  if (!variants || variants.length === 0) return message;

  const options = [message, ...variants];
  const seed = `${conversationId}:${nodeId}`;
  const hash = simpleHash(seed);
  return options[hash % options.length] ?? message;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0; // Force 32-bit integer
  }
  return Math.abs(hash);
}
