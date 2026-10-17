/** Letters and digits that can't be mistaken for one another when read aloud or copied by hand. */
export const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** The shortest password the API accepts. */
export const MIN_PASSWORD = 12;

/**
 * A random password from the browser's secure generator, drawn without
 * modulo bias. `random` fills a byte array, like `crypto.getRandomValues`.
 */
export function generatePassword(
  length = 20,
  random: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
): string {
  const size = PASSWORD_ALPHABET.length;
  // The largest multiple of the alphabet's size below 256; bytes above it are drawn again.
  const limit = 256 - (256 % size);
  let out = "";
  while (out.length < length) {
    for (const byte of random(new Uint8Array(length * 2))) {
      if (byte >= limit) continue;
      out += PASSWORD_ALPHABET[byte % size];
      if (out.length === length) break;
    }
  }
  return out;
}

/** Why a chosen password can't be used, or null; an empty one lets the server make one. */
export function passwordProblem(password: string): string | null {
  if (password === "") return null;
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters, or leave it empty to have one made.`;
  return null;
}
