"use client";

import { CircleAlert, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A screen failed to render; the sidebar stays usable. */
export default function ConsoleError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <CircleAlert className="size-5" />
      </span>
      <div>
        <p className="text-sm font-medium">This screen ran into a problem</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Try again. If it keeps happening, reload the page.
        </p>
      </div>
      <Button variant="outline" onClick={retry}>
        <RotateCw /> Try again
      </Button>
    </div>
  );
}
