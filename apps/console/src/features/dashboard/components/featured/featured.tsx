import { featuredApps } from "@/mocks/dashboard";
import { AppTile } from "./app-tile";
import { PromoCard } from "./promo-card";

/** Promo banner with two before/after app tiles beside it. */
export function Featured() {
  return (
    <section className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <PromoCard />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {featuredApps.map((app) => (
          <AppTile key={app.title} app={app} />
        ))}
      </div>
    </section>
  );
}
