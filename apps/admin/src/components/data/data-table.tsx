"use client";

import { useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ErrorState } from "./states";

export interface Column<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
  /** Applied to the header and every cell of the column. */
  className?: string;
}

const alignClass = (align: Column<unknown>["align"]) => (align === "right" ? "text-right" : "text-left");

/**
 * A table with a sticky header that scrolls inside its own box. Loading,
 * failure and emptiness render in the body so the header stays put.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  isActiveRow,
  loading = false,
  error,
  onRetry,
  retrying,
  empty,
  skeletonRows = 8,
  className,
  label,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  isActiveRow?: (row: T) => boolean;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  empty: React.ReactNode;
  skeletonRows?: number;
  className?: string;
  /** Accessible name of the table. */
  label: string;
}) {
  const span = columns.length;
  const box = useRef<HTMLDivElement>(null);
  const active = rows && isActiveRow ? rows.find(isActiveRow) : undefined;
  const activeKey = active === undefined ? undefined : rowKey(active);

  // The row open in the panel stays in view while the panel moves through the
  // list. Only the table's own box scrolls, so the page under the panel stays put.
  useEffect(() => {
    const container = box.current;
    const row = activeKey === undefined ? null : container?.querySelector<HTMLElement>("tr[data-active]");
    if (!container || !row) return;
    const area = container.getBoundingClientRect();
    const top = area.top + (container.querySelector("thead")?.getBoundingClientRect().height ?? 0);
    const rect = row.getBoundingClientRect();
    if (rect.top < top) container.scrollTop -= top - rect.top;
    else if (rect.bottom > area.bottom) container.scrollTop += rect.bottom - area.bottom;
  }, [activeKey]);

  let body: React.ReactNode;
  if (error && !rows) {
    body = (
      <tr>
        <td colSpan={span}>
          <ErrorState error={error} onRetry={onRetry} retrying={retrying} />
        </td>
      </tr>
    );
  } else if (loading || !rows) {
    body = Array.from({ length: skeletonRows }, (_, i) => (
      <tr key={i}>
        {columns.map((column) => (
          <td key={column.id} className={cn("h-10 px-3", column.className)}>
            <Skeleton className={cn("h-3.5", column.align === "right" ? "ml-auto w-10" : "w-3/4")} />
          </td>
        ))}
      </tr>
    ));
  } else if (rows.length === 0) {
    body = (
      <tr>
        <td colSpan={span}>{empty}</td>
      </tr>
    );
  } else {
    body = rows.map((row) => (
      <tr
        key={rowKey(row)}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
        onKeyDown={
          onRowClick
            ? (e) => {
                if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onRowClick(row);
                }
              }
            : undefined
        }
        tabIndex={onRowClick ? 0 : undefined}
        data-active={isActiveRow?.(row) || undefined}
        className={cn(
          // Clear of the sticky header when scrolled into view.
          "scroll-mt-10 transition-colors data-active:bg-muted/70",
          onRowClick &&
            "cursor-pointer outline-none hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        )}
      >
        {columns.map((column) => (
          <td
            key={column.id}
            className={cn("h-12 px-4 py-2 align-middle", alignClass(column.align), column.className)}
          >
            {column.cell(row)}
          </td>
        ))}
      </tr>
    ));
  }

  return (
    <div ref={box} className={cn("scroll-thin relative min-h-0 flex-1 overflow-auto", className)}>
      <table className="w-full border-separate border-spacing-0 text-sm" aria-label={label}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className={cn(
                  "sticky top-0 z-10 h-10 border-b bg-card px-4 text-xs font-medium whitespace-nowrap text-muted-foreground",
                  alignClass(column.align),
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:border-b [&_tr:last-child_td]:border-b-0">{body}</tbody>
      </table>
    </div>
  );
}

/**
 * The rows a list query has for the table. While a new page or filter is
 * loading the previous rows stay up; if that load fails they are dropped, so
 * the error shows instead of rows that don't match the filters.
 */
export function rowsOf<T>(query: {
  data?: { items: T[] };
  error: unknown;
  isPlaceholderData: boolean;
}): T[] | undefined {
  return query.error && query.isPlaceholderData ? undefined : query.data?.items;
}
