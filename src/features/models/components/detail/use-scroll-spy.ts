"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tracks which section is under the top of the viewport. `jump` smooth-scrolls to a
 * section and holds the highlight on it until the scroll settles.
 */
export function useScrollSpy<T extends string>(ids: readonly T[], offset = 140) {
  const [active, setActive] = useState<T>(ids[0]);
  const target = useRef<T | null>(null);

  useEffect(() => {
    const update = () => {
      if (target.current) return;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const passed = ids.filter((id) => (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) < offset);
      setActive(atBottom ? ids.at(-1)! : (passed.at(-1) ?? ids[0]));
    };
    const release = () => {
      target.current = null;
      update();
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("scrollend", release);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("scrollend", release);
    };
  }, [ids, offset]);

  const jump = (id: T) => {
    const el = document.getElementById(id);
    if (!el) return;
    target.current = id;
    setActive(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    // Browsers without `scrollend` still release the lock.
    setTimeout(() => {
      if (target.current === id) target.current = null;
    }, 1200);
  };

  return { active, jump };
}
