import { describe, expect, it } from "vitest";
import { generatePassword, MIN_PASSWORD, PASSWORD_ALPHABET, passwordProblem } from "./passwords";

describe("generatePassword", () => {
  it("makes a password of the asked length from the alphabet", () => {
    const password = generatePassword(24);
    expect(password).toHaveLength(24);
    expect([...password].every((c) => PASSWORD_ALPHABET.includes(c))).toBe(true);
  });

  it("is long enough by default", () => {
    expect(generatePassword().length).toBeGreaterThanOrEqual(MIN_PASSWORD);
  });

  it("draws again instead of skewing towards the start of the alphabet", () => {
    // 255 is above the last whole multiple of the alphabet's size, so it is skipped.
    let calls = 0;
    const random = (bytes: Uint8Array) => {
      calls += 1;
      bytes.fill(calls === 1 ? 255 : 0);
      return bytes;
    };
    expect(generatePassword(4, random)).toBe(PASSWORD_ALPHABET[0].repeat(4));
    expect(calls).toBe(2);
  });

  it("differs from one call to the next", () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });
});

describe("passwordProblem", () => {
  it("lets an empty password through, for the server to make one", () => {
    expect(passwordProblem("")).toBeNull();
  });

  it("asks for at least 12 characters", () => {
    expect(passwordProblem("short")).toMatch(/at least 12/);
    expect(passwordProblem("x".repeat(12))).toBeNull();
  });
});
