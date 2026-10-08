"use client";

import Link from "next/link";
import { Database, Terminal } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader, SectionLink } from "@/components/ui/section-header";
import { RequestTable } from "@/features/usage/components/request-table";
import { useConsole } from "@/providers/console-provider";

export function RecentRequests() {
  const { sampleMode, setSampleMode } = useConsole();

  return (
    <section>
      <SectionHeader
        title="Recent requests"
        description="Live tail of the last calls made with your keys."
        action={<SectionLink href="/usage">Open logs</SectionLink>}
      />
      {sampleMode ? (
        <RequestTable />
      ) : (
        <EmptyState
          icon={<Terminal />}
          title="No requests yet"
          description="Requests show up here a few seconds after they hit the API."
          action={
            <div className="flex gap-2">
              <Link href="/quickstart" className={buttonClass({ variant: "primary", size: "sm" })}>
                Make a request
              </Link>
              <Button variant="outline" size="sm" onClick={() => setSampleMode(true)}>
                <Database /> Preview sample data
              </Button>
            </div>
          }
        />
      )}
    </section>
  );
}
