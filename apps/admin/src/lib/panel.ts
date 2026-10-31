import type { Permission } from "@modelvend/admin-api/auth";

/** The query parameter of the item open in the side panel: `?panel=task:<id>`. */
export const PANEL_PARAM = "panel";

/** What the side panel can show, on any page. */
export const PANEL_KINDS = ["task"] as const;

export type PanelKind = (typeof PANEL_KINDS)[number];

/** One item open in the side panel. */
export interface PanelRef {
  kind: PanelKind;
  id: string;
}

/** The permission an operator needs to open each kind of item. */
export const PANEL_PERMISSIONS: Record<PanelKind, Permission> = {
  task: "tasks.view",
};

const isKind = (value: string): value is PanelKind => (PANEL_KINDS as readonly string[]).includes(value);

/**
 * `task:<id>` → `{ kind: "task", id }`; null for anything else. An ID never holds a slash or "..", so a
 * crafted link can't make it read as a path to another endpoint (the client encodes IDs as well).
 */
export function parsePanel(value: string | null | undefined): PanelRef | null {
  if (!value) return null;
  const at = value.indexOf(":");
  if (at <= 0) return null;
  const kind = value.slice(0, at);
  const id = value.slice(at + 1).trim();
  if (!isKind(kind) || !id || /[/\\]|\.\./.test(id)) return null;
  return { kind, id };
}

export const formatPanel = (ref: PanelRef) => `${ref.kind}:${ref.id}`;

export const samePanel = (a: PanelRef | null | undefined, b: PanelRef | null | undefined) =>
  a?.kind === b?.kind && a?.id === b?.id;

/** The item the URL opens in the panel. */
export function panelFromQuery(params: Pick<URLSearchParams, "get">): PanelRef | null {
  return parsePanel(params.get(PANEL_PARAM));
}

/**
 * A query string without the leading "?". The panel's colon stays readable
 * (`panel=task:task_1`); it needs no escaping in a query.
 */
export function encodeQuery(params: URLSearchParams): string {
  return params.toString().replace(/(^|&)(panel=[a-z]+)%3A/g, "$1$2:");
}

/** The query string with `ref` open in the panel (or the panel closed). */
export function withPanel(search: string, ref: PanelRef | null): string {
  const next = new URLSearchParams(search);
  if (ref) next.set(PANEL_PARAM, formatPanel(ref));
  else next.delete(PANEL_PARAM);
  return encodeQuery(next);
}

/** The current page with `ref` open in its side panel, for links that open in place. */
export function panelHref(pathname: string, search: string, ref: PanelRef): string {
  return `${pathname}?${withPanel(search, ref)}`;
}

/** The item before or after the open one in the list on screen, or null at either end or off the list. */
export function stepFrom(ids: readonly string[], current: string | undefined, step: 1 | -1): string | null {
  if (!current) return null;
  const index = ids.indexOf(current);
  if (index === -1) return null;
  return ids[index + step] ?? null;
}

/** The items around `id` in the list on screen; null when it isn't on the list. */
export function neighbours(ids: readonly string[], id: string): { previous: string | null; next: string | null } | null {
  const index = ids.indexOf(id);
  if (index === -1) return null;
  return { previous: ids[index - 1] ?? null, next: ids[index + 1] ?? null };
}

/**
 * What to open once `done` leaves the list (it was dealt with): the next
 * item, else the one before it, else nothing. When `done` wasn't on the list,
 * the first item that is.
 */
export function nextAfter(ids: readonly string[], done: string): string | null {
  const index = ids.indexOf(done);
  if (index === -1) return ids.find((id) => id !== done) ?? null;
  return ids[index + 1] ?? ids[index - 1] ?? null;
}

/** Keys that move between items while a panel is open: J or ↓ for the next, K or ↑ for the previous. */
export function stepKey(event: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">): 1 | -1 | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  switch (event.key) {
    case "j":
    case "J":
    case "ArrowDown":
      return 1;
    case "k":
    case "K":
    case "ArrowUp":
      return -1;
    default:
      return null;
  }
}

/** Keys typed into a field belong to the field, not to the panel. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  return Boolean((target as Element).closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='listbox'], [role='menu']"));
}

/** History state keys the router owns; it adds them back to every entry itself. */
const ROUTER_KEYS = ["__NA", "_N", "__PRIVATE_NEXTJS_INTERNALS_TREE"];

/** Marks a history entry that opening a panel added, so closing it goes back instead of adding another. */
export const PANEL_ENTRY = "panelEntry";

/**
 * The state for a new or replaced history entry: the current entry's own
 * keys (such as the panel mark) without the router's, plus `extra`. Passing
 * the router's keys would make it skip syncing the URL.
 */
export function carryState(current: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const own: Record<string, unknown> = {};
  if (current && typeof current === "object") {
    for (const [key, value] of Object.entries(current)) {
      if (!ROUTER_KEYS.includes(key)) own[key] = value;
    }
  }
  return { ...own, ...extra };
}
