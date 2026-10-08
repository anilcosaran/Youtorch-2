"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { KeyRound, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { site } from "@/config/site";
import { useConsole } from "@/providers/console-provider";
import { ApiKeysTable } from "./api-keys-table";
import { CreateKeyDialog } from "./create-key-dialog";

export function ApiKeysView() {
  const { keys, revokeKey } = useConsole();
  const toast = useToast();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  // `/api-keys?new=1` (from Quickstart or the command menu) opens the dialog once.
  const wantsNew = searchParams.get("new") === "1";
  useEffect(() => {
    if (!wantsNew) return;
    window.history.replaceState(null, "", "/api-keys");
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, [wantsNew]);

  return (
    <>
      <PageHeader
        eyebrow="Build"
        title="API keys"
        description={`Keys authenticate requests to the ${site.name} API. Test keys hit the same models but are never billed.`}
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus /> New key
          </Button>
        }
      />

      {keys.length ? (
        <ApiKeysTable
          keys={keys}
          onRevoke={(k) => {
            revokeKey(k.id);
            toast(`Revoked “${k.name}”`);
          }}
        />
      ) : (
        <EmptyState
          icon={<KeyRound />}
          title="No API keys yet"
          description="Create a key to start calling any model in the library."
          action={
            <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
              <Plus /> Create your first key
            </Button>
          }
        />
      )}

      <CreateKeyDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
