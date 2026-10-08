import { featuredApps } from "@/mocks/dashboard";
import { AppTile } from "./app-tile";
import { PromoCard } from "./promo-card";

/** Promo banner with a 2×2 grid of task-first app shortcuts beside it. */
export function Featured() {
  return (
    <section className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <PromoCard />
      <div className="grid grid-cols-2 gap-3 sm:auto-rows-fr">
        {featuredApps.map((app) => (
          <AppTile key={app.title} app={app} />
        ))}
      </div>
    </section>
  );
}
