"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/cn";

/** Mobile-only bar that opens the navigation drawer; desktop pages start right at the top. */
export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 items-center border-b px-4 transition-colors duration-300 sm:px-6 lg:hidden",
        scrolled ? "border-line bg-canvas/80 backdrop-blur-xl" : "border-transparent",
      )}
    >
      <button
        onClick={onOpenMenu}
        aria-label="Open navigation"
        className="grid size-8 place-items-center rounded-lg text-fg/80 hover:bg-white/10 hover:text-fg"
      >
        <Menu className="size-4" />
      </button>
    </header>
  );
}
