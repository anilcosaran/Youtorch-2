import type { Model } from "@/types/model";

/** Applies the model's launch discount to a list price (the default tier when omitted). */
export function discounted(model: Model, listPrice = model.price) {
  return +(listPrice * (1 - (model.promo ?? 0))).toFixed(4);
}
