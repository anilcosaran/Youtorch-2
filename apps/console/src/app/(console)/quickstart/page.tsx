import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { QuickstartGuide } from "@/features/quickstart/components/quickstart-guide";
import { QuickstartSteps } from "@/features/quickstart/components/quickstart-steps";

export const metadata: Metadata = { title: "Quickstart" };

export default function QuickstartPage() {
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Quickstart"
        description="Start from the API, or connect Claude Code, Codex, Gemini or Cursor over MCP with the same API key."
      />
      <QuickstartGuide api={<QuickstartSteps />} />
      <Link
        href="/models"
        className="mt-12 ml-12 inline-flex items-center gap-1.5 text-[14px] font-medium text-ember-300 hover:text-ember-200"
      >
        Browse the model library <ArrowRight className="size-3.5" />
      </Link>
    </>
  );
}
