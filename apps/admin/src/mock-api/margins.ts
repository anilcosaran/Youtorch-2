import { can } from "@/lib/permissions";
import { fail } from "./http";
import { actor, type Context } from "./router";

export interface Sale {
  /** What is on sale, for messages: a tier or an app. */
  name: string;
  /** What customers pay, after any promo. */
  price: number;
  cost: number;
}

/**
 * The margin rule (docs/product-rules.md): under the minimum needs a reason, below cost also needs
 * pricing.below_cost. The server enforces it at publish, since a draft's prices and costs may still be moving.
 */
export function checkMargins(ctx: Context, sales: readonly Sale[], why: string | undefined): void {
  const { minMargin } = ctx.store.settings;
  for (const sale of sales) {
    if (sale.cost > sale.price && !can(actor(ctx), "pricing.below_cost")) {
      fail(403, "below_cost", `${sale.name} would sell below cost. That needs the Sell below cost permission (pricing.below_cost).`);
    }
    if (sale.price <= 0 || (sale.price - sale.cost) / sale.price >= minMargin) continue;
    if (!why) {
      const message = `${sale.name} is under the ${Math.round(minMargin * 100)}% minimum margin on its costliest route. Give a reason to publish it anyway.`;
      fail(422, "low_margin", message, { reason: message });
    }
  }
}
