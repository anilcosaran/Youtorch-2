/** Every word of the query appears in one of the texts, ignoring case. */
export function matchesQuery(query: string, ...texts: (string | undefined)[]): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();
  return words.every((word) => haystack.includes(word));
}
