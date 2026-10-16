const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatUsd(value: number) {
  return usd.format(value);
}

export function splitUsd(value: number) {
  const [whole, cents = "00"] = usd.format(value).split(".");
  return { whole, cents };
}

export function formatCompact(value: number) {
  return compact.format(value);
}

/** Unit prices keep sub-cent precision: $0.0292, $0.114, $1.03. */
export function formatPrice(value: number) {
  return `$${value >= 1 ? value.toFixed(2) : value.toFixed(4).replace(/0{1,2}$/, "")}`;
}
