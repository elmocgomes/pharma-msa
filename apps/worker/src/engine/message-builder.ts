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
