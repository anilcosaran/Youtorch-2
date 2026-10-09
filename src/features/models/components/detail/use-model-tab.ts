"use client";

import { useSearchParams } from "next/navigation";
import { defaultTab, isModelTab, type ModelTabId } from "./tabs";

/** Active tab lives in `?tab=` so it survives reloads and can be linked; the default tab keeps the URL clean. */
export function useModelTab() {
  const searchParams = useSearchParams();
  const param = searchParams.get("tab");
  const tab = isModelTab(param) ? param : defaultTab;

  const select = (next: ModelTabId) => {
    if (next === tab) return;
    const params = new URLSearchParams(searchParams);
    if (next === defaultTab) params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    window.history.pushState(null, "", query ? `?${query}` : window.location.pathname);
  };

  return [tab, select] as const;
}
