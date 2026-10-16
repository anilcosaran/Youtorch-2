import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Boxes } from "lucide-react";
import { StatusScreen } from "@/components/feedback/status-screen";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="min-h-screen">
      <StatusScreen
        code="404"
        title="This page doesn't exist"
        description="The link may be broken, or the page may have moved. Check the URL or head back to the console."
        actions={
          <>
            <Link href="/" className={buttonClass({ variant: "primary" })}>
              <ArrowLeft /> Back to dashboard
            </Link>
            <Link href="/models" className={buttonClass({ variant: "outline" })}>
              <Boxes /> Model library
            </Link>
          </>
        }
      />
    </main>
  );
}
