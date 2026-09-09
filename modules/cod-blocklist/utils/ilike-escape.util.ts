/** Escape `%`, `_`, and `\` so user search is treated as a literal ILIKE pattern. */
export function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function toIlikeContains(value: string): string {
  return `%${escapeIlikePattern(value)}%`;
}
