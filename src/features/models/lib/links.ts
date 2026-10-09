export function modelHref(slug: string) {
  return `/models/${slug}`;
}

/** The playground is the model page's default tab; a prompt prefills it. */
export function playgroundHref(slug: string, prompt?: string) {
  return prompt ? `${modelHref(slug)}?${new URLSearchParams({ prompt })}` : modelHref(slug);
}
