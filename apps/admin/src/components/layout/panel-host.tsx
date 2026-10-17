"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { PanelSheet } from "@/components/shared/side-panel";
import { RequestPanel } from "@/features/requests/request-panel";
import { PANEL_PERMISSIONS, panelFromQuery, samePanel, type PanelRef } from "@/lib/panel";
import { useSession } from "@/lib/session";
import { usePanelLists, usePanels } from "./panel-context";

function PanelContent({ item }: { item: PanelRef }) {
  const lists = usePanelLists();
  const { step } = usePanels();
  const ids = lists[item.kind]?.ids ?? [];
  const onOpen = (id: string | null) => void step(id ? { kind: item.kind, id } : null);
  switch (item.kind) {
    case "request":
      return <RequestPanel openId={item.id} ids={ids} onOpen={onOpen} />;
  }
}

/**
 * Shows the item the URL names (`?panel=request:<id>`) in the side panel over
 * the current page, which keeps its scroll and state.
 */
export function PanelHost() {
  const params = useSearchParams();
  const { allows } = useSession();
  const { close } = usePanels();
  const requested = panelFromQuery(params);
  const current = requested && allows(PANEL_PERMISSIONS[requested.kind]) ? requested : null;

  // The last item stays in the panel while it slides out.
  const [shown, setShown] = useState<PanelRef | null>(current);
  if (current && !samePanel(current, shown)) setShown(current);

  return (
    <PanelSheet open={current !== null} onClose={() => void close()}>
      {shown && <PanelContent item={shown} />}
    </PanelSheet>
  );
}
