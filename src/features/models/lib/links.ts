export function modelHref(slug: string) {
  return `/models/${slug}`;
}

/** Opens the model page with the playground panel, optionally prefilled. */
export function playgroundHref(slug: string, prompt?: string) {
  const params = new URLSearchParams({ playground: "1" });
  if (prompt) params.set("prompt", prompt);
  return `${modelHref(slug)}?${params}`;
}
