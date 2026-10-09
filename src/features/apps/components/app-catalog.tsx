"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { appCategories, apps, type AppCategory } from "@/mocks/apps";
import { AppCard } from "./app-card";

type Filter = "all" | AppCategory;

const filters: { value: Filter; label: string }[] = [{ value: "all", label: "All" }, ...appCategories.map((c) => ({ value: c, label: c }))];

export function AppCatalog() {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? apps : apps.filter((a) => a.category === filter);

  return (
    <>
      <Segmented value={filter} onChange={setFilter} options={filters} className="mb-5" />
      <ul className="grid gap-4 min-[1800px]:grid-cols-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((app) => (
          <li key={app.slug}>
            <AppCard app={app} />
          </li>
        ))}
      </ul>
    </>
  );
}
