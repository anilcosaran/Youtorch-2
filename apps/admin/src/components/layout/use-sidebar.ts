"use client";

import { useCallback, useSyncExternalStore } from "react";
import { SIDEBAR_STORAGE_KEY } from "./sidebar-state";

const CHANGE_EVENT = "console:sidebar";

function apply(collapsed: boolean) {
  const root = document.documentElement;
  if (collapsed) root.dataset.sidebar = "collapsed";
  else delete root.dataset.sidebar;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  // Another tab folded or unfolded the sidebar.
  const onStorage = (event: StorageEvent) => {
    if (event.key === SIDEBAR_STORAGE_KEY) apply(event.newValue === "collapsed");
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

const snapshot = () => document.documentElement.dataset.sidebar === "collapsed";
const serverSnapshot = () => false;

/**
 * Whether the desktop sidebar is folded to its icon rail. The state lives on
 * `<html data-sidebar>`, which CSS reads, and in localStorage.
 */
export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const setCollapsed = useCallback((next: boolean) => {
    apply(next);
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "collapsed" : "expanded");
    } catch {
      // Storage is blocked; the choice lasts until the page reloads.
    }
  }, []);
  return [collapsed, setCollapsed];
}
