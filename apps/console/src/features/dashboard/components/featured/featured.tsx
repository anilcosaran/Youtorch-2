import { cn } from "@/lib/cn";
import { findApp } from "@/mocks/apps";
import { featuredApps, promoBanners } from "@/mocks/dashboard";
import { findModel } from "@/mocks/models";
import { AppTile } from "./app-tile";
import { PromoCard } from "./promo-card";

/** The first promo whose offer still runs, with two before/after app tiles beside it. Apps or models that are gone are skipped. */
export function Featured() {
  const promo = promoBanners.map((banner) => ({ banner, model: findModel(banner.slug) })).find((p) => p.model?.promo);
  const tiles = featuredApps.flatMap((tile) => {
    const app = findApp(tile.app);
    return app ? [{ tile, price: app.price }] : [];
  });
  if (!promo?.model && !tiles.length) return null;

  return (
    <section className={cn("grid gap-3", promo?.model && tiles.length > 0 && "xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]")}>
      {promo?.model && <PromoCard banner={promo.banner} model={promo.model} />}
      {tiles.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {tiles.map(({ tile, price }) => (
            <AppTile key={tile.title} app={tile} price={price} />
          ))}
        </div>
      )}
    </section>
  );
}
