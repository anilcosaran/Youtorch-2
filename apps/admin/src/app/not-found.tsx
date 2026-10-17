import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <Logo className="size-10" />
      <p className="text-sm font-medium">There&apos;s nothing at this address</p>
      <p className="max-w-sm text-sm text-muted-foreground">The link may be old or mistyped.</p>
      <Button variant="outline" asChild>
        <Link href="/">Go to the overview</Link>
      </Button>
    </div>
  );
}
