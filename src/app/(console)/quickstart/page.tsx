import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { QuickstartSteps } from "@/features/quickstart/components/quickstart-steps";

export const metadata: Metadata = { title: "Quickstart" };

export default function QuickstartPage() {
  return (
    <>
      <PageHeader eyebrow="Workspace" title="Quickstart" description="Four steps from an empty project to a generated asset." />
      <QuickstartSteps />
      <Link
        href="/models"
        className="mt-12 ml-12 inline-flex items-center gap-1.5 text-[14px] font-medium text-ember-300 hover:text-ember-200"
      >
        Browse the model library <ArrowRight className="size-3.5" />
      </Link>
    </>
  );
}
