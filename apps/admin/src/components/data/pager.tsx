"use client";

import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { integer } from "@/lib/format";
import type { Pager } from "@/lib/use-url-state";

/** Footer of a paged list: where you are, and the way back and forth. */
export function PagerBar({
  pager,
  nextCursor,
  shown,
  fetching,
}: {
  pager: Pager;
  nextCursor: string | null | undefined;
  /** Rows on this page. */
  shown: number | undefined;
  fetching: boolean;
}) {
  if (!pager.hasPrevious && !nextCursor) {
    return shown ? (
      <div className="flex h-11 shrink-0 items-center border-t px-3 text-xs text-muted-foreground">
        {integer(shown)} {shown === 1 ? "row" : "rows"}
      </div>
    ) : null;
  }
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-t px-3">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {pager.page !== null && `Page ${pager.page}`}
        {shown !== undefined && pager.page !== null && " · "}
        {shown !== undefined && `${integer(shown)} ${shown === 1 ? "row" : "rows"}`}
        {fetching && <LoaderCircle className="size-3.5 animate-spin" aria-label="Loading" />}
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={!pager.hasPrevious || fetching}
          onClick={pager.previous}
        >
          <ChevronLeft /> Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!nextCursor || fetching}
          onClick={() => nextCursor && pager.next(nextCursor)}
        >
          Next <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
