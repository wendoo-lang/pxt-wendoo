import { randomInt } from "node:crypto";

/** Characters a join code is drawn from: digits and capitals, minus the easily confused 0, 1, I, L, and O. */
const JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Number of characters in a join code. */
const JOIN_CODE_LENGTH = 6;

/** Returns a random join code, for example `K7QX2M`. Uniqueness is the caller's to check. */
export function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
}
