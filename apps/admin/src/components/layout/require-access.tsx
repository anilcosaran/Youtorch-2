"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import { EmptyState } from "@/components/data/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session";
import { navItem } from "./nav";
import { PageFill, PageHeader } from "./page-header";

/** Shown in place of a page the operator may not open. */
export function NoAccess({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <PageFill>
        <EmptyState
          icon={LockKeyhole}
          title="You don't have access to this page"
          description={`Your account can't open ${title}. Ask an admin for access if you need it.`}
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href="/">Go to the overview</Link>
            </Button>
          }
          className="flex-1 rounded-lg border bg-card"
        />
      </PageFill>
    </>
  );
}

/**
 * Renders a page only for operators with the permission its nav item
 * requires. Until the operator has loaded nothing is requested, so a page
 * without access never flashes an error.
 */
export function RequireAccess({ page, children }: { page: string; children: ReactNode }) {
  const { operator, allows } = useSession();
  const item = navItem(page);
  if (!item?.requires) return children;
  if (!operator) {
    return (
      <>
        <PageHeader title={item.label} />
        <PageFill>
          <Skeleton className="h-9 w-80 max-w-full rounded-lg" />
          <Skeleton className="min-h-80 flex-1 rounded-lg" />
        </PageFill>
      </>
    );
  }
  if (!allows(item.requires)) return <NoAccess title={item.label} />;
  return children;
}
