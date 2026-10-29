"use client";

import { CircleAlert, Inbox, LoaderCircle, RotateCw, type LucideIcon } from "lucide-react";
import { errorMessage } from "@modelvend/admin-api/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Nothing to show yet: one sentence about why, and optionally what to do. */
export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-10 text-center",
        className,
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** A request failed: what went wrong and a way to try again. */
export function ErrorState({
  error,
  onRetry,
  retrying = false,
  title = "Couldn't load this",
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-10 text-center",
        className,
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <CircleAlert className="size-4" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-1" onClick={onRetry} disabled={retrying}>
          {retrying ? <LoaderCircle className="animate-spin" /> : <RotateCw />}
          Try again
        </Button>
      )}
    </div>
  );
}
