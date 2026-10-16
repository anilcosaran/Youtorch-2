"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ChevronRight, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { SidebarContent } from "./sidebar";

function MobileNav() {
  const [open, setOpen] = useState(false);
  // Leaving through a link or the search keeps focus where it went instead of
  // returning it to the menu button; Escape and the overlay still return it.
  const leaving = useRef(false);
  const leave = () => {
    leaving.current = true;
    setOpen(false);
  };
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="-ml-1.5 lg:hidden">
          <Menu />
          <span className="sr-only">Open navigation</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-64 gap-0 bg-sidebar p-0"
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          if (leaving.current) event.preventDefault();
          leaving.current = false;
        }}
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">Console sections</SheetDescription>
        <SidebarContent onNavigate={leave} />
      </SheetContent>
    </Sheet>
  );
}

/** Sticky bar at the top of every screen: title (with its parent) on the left, actions on the right. */
export function PageHeader({
  title,
  parent,
  description,
  children,
}: {
  title: React.ReactNode;
  /** The list a detail page belongs to, shown as a breadcrumb. */
  parent?: { href: string; label: string };
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-4 py-3 sm:px-8">
      <MobileNav />
      {/* Actions move under the title when both don't fit on one line. */}
      <div className="min-w-40 flex-1">
        <h1 className="flex min-w-0 items-center gap-2 text-lg leading-tight font-semibold tracking-tight">
          {parent && (
            <>
              <Link
                href={parent.href}
                className="shrink-0 font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:underline"
              >
                {parent.label}
              </Link>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </>
          )}
          <span className="truncate">{title}</span>
        </h1>
        {description && <p className="mt-0.5 text-xs text-pretty text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </header>
  );
}

/** Scrollable body for standard pages. */
export function PageBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    // A stable gutter keeps the page from shifting sideways when its height changes.
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
      <div className={cn("mx-auto w-full max-w-[1600px] p-4 sm:px-8 sm:py-6", className)}>{children}</div>
    </div>
  );
}

/** Body for list pages: fills the screen so the list scrolls inside its own panel. */
export function PageFill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "scroll-thin mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-4 overflow-y-auto p-4 [scrollbar-gutter:stable] sm:px-8 sm:py-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
