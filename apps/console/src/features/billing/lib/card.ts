/** Display-only card helpers. Real card data must be collected by the payment provider's hosted fields. */

export const cardDigits = (value: string) => value.replace(/\D/g, "");

export function formatCardNumber(value: string) {
  return cardDigits(value)
    .slice(0, 16)
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

export function formatExpiry(value: string) {
  const v = cardDigits(value).slice(0, 4);
  return v.length > 2 ? `${v.slice(0, 2)}/${v.slice(2)}` : v;
}

export const formatCvc = (value: string) => cardDigits(value).slice(0, 4);

export function cardBrand(digits: string) {
  return digits.startsWith("4") ? "Visa" : digits.startsWith("3") ? "Amex" : "Mastercard";
}

export function isCardComplete(digits: string, expiry: string, cvc: string) {
  return digits.length >= 15 && /^\d{2}\/\d{2}$/.test(expiry) && cvc.length >= 3;
}
