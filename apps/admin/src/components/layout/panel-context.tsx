"use client";

import { useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import {
  carryState,
  PANEL_ENTRY,
  panelFromQuery,
  withPanel,
  type PanelKind,
  type PanelRef,
} from "@/lib/panel";

/** The items of a list on screen, so the panel can step through them. */
export interface PanelList {
  ids: string[];
  /** Where to go once the open item leaves the list; defaults to `ids`. */
  after?: string[];
}

type Lists = Partial<Record<PanelKind, PanelList>>;

/** Asks before the open item is left, e.g. with unsaved changes; resolves true to leave. */
type Guard = () => Promise<boolean>;

/** Lists and the leave guard live outside React state, so registering them never re-renders the page. */
class PanelStore {
  private lists: Lists = {};
  private owners = new Map<PanelKind, object>();
  private listeners = new Set<() => void>();
  private guard: { owner: object; ask: Guard } | null = null;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  snapshot = () => this.lists;

  setList(kind: PanelKind, list: PanelList, owner: object) {
    this.owners.set(kind, owner);
    this.lists = { ...this.lists, [kind]: list };
    this.listeners.forEach((listener) => listener());
  }

  setGuard(ask: Guard, owner: object) {
    this.guard = { owner, ask };
  }

  clearGuard(owner: object) {
    if (this.guard?.owner === owner) this.guard = null;
  }

  /** Whether the guard lets the open item go. */
  mayLeave(): Promise<boolean> {
    return this.guard ? this.guard.ask() : Promise.resolve(true);
  }

  removeList(kind: PanelKind, owner: object) {
    if (this.owners.get(kind) !== owner) return;
    this.owners.delete(kind);
    const next = { ...this.lists };
    delete next[kind];
    this.lists = next;
    this.listeners.forEach((listener) => listener());
  }
}

const EMPTY: Lists = {};

interface PanelActions {
  /** Opens an item over the current page. From the page it adds a history entry, so Back closes it. */
  open: (ref: PanelRef) => Promise<void>;
  /** Moves the panel to another item (or closes it with null) without a new history entry. */
  step: (ref: PanelRef | null) => Promise<void>;
  close: () => Promise<void>;
}

const StoreContext = createContext<PanelStore | null>(null);

function currentPanel(): PanelRef | null {
  return panelFromQuery(new URLSearchParams(window.location.search));
}

function urlWith(ref: PanelRef | null): string {
  const query = withPanel(window.location.search, ref);
  return query ? `${window.location.pathname}?${query}` : window.location.pathname;
}

/** Where a history entry opening the panel was added, while going back over it is under way. */
let leaving: string | null = null;

function actionsFor(store: PanelStore): PanelActions {
  const close = async () => {
    if (!currentPanel() || leaving === window.location.href) return;
    if (!(await store.mayLeave())) return;
    const state = window.history.state as Record<string, unknown> | null;
    if (state?.[PANEL_ENTRY]) {
      // The panel added this entry: going back closes it and keeps Forward meaningful.
      leaving = window.location.href;
      window.addEventListener("popstate", () => (leaving = null), { once: true });
      window.history.back();
      return;
    }
    window.history.replaceState(carryState(state), "", urlWith(null));
  };
  const step = async (ref: PanelRef | null) => {
    if (!ref) return close();
    if (!(await store.mayLeave())) return;
    window.history.replaceState(carryState(window.history.state), "", urlWith(ref));
  };
  const open = async (ref: PanelRef) => {
    if (currentPanel()) return step(ref);
    leaving = null;
    window.history.pushState(carryState(window.history.state, { [PANEL_ENTRY]: true }), "", urlWith(ref));
  };
  return { open, step, close };
}

/** One side panel for the whole console; pages open items in it through `usePanels`. */
export function PanelProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => new PanelStore(), []);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

function useStore(): PanelStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("Panels need PanelProvider");
  return store;
}

export function usePanels(): PanelActions {
  const store = useStore();
  return useMemo(() => actionsFor(store), [store]);
}

/** The lists pages registered, by kind. */
export function usePanelLists(): Lists {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.snapshot, () => EMPTY);
}

/** The ID of the item of `kind` open in the panel, for highlighting its row. */
export function usePanelOpen(kind: PanelKind): string | undefined {
  const params = useSearchParams();
  const ref = panelFromQuery(params);
  return ref?.kind === kind ? ref.id : undefined;
}

/**
 * Lets the panel step through a list on screen with J/K. `after` is where an
 * item that leaves the list moves on to. IDs must not contain commas.
 */
export function usePanelList(kind: PanelKind, ids: readonly string[], after?: readonly string[]) {
  const store = useStore();
  const key = `${ids.join(",")}|${after ? after.join(",") : "-"}`;
  useEffect(() => {
    const [idPart, afterPart] = key.split("|");
    const split = (part: string) => (part ? part.split(",") : []);
    const owner = {};
    store.setList(kind, { ids: split(idPart), after: afterPart === "-" ? undefined : split(afterPart) }, owner);
    return () => store.removeList(kind, owner);
  }, [store, kind, key]);
}

/** Asks `ask` before the open item is left while `active` (unsaved changes, for example). */
export function usePanelGuard(active: boolean, ask: Guard) {
  const store = useStore();
  useEffect(() => {
    if (!active) return;
    const owner = {};
    store.setGuard(ask, owner);
    return () => store.clearGuard(owner);
  }, [store, active, ask]);
}
