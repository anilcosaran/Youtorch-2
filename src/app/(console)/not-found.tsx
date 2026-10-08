import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StatusScreen } from "@/components/feedback/status-screen";
import { buttonClass } from "@/components/ui/button";

export default function ConsoleNotFound() {
  return (
    <StatusScreen
      code="404"
      title="Nothing here"
      description="We couldn't find what you were looking for. It may have been renamed or removed from the library."
      actions={
        <Link href="/models" className={buttonClass({ variant: "primary" })}>
          <ArrowLeft /> Browse models
        </Link>
      }
    />
  );
}
