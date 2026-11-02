// What the password window says while a vault password is typed (0.1.26,
// vault-password-texts.md, section 1): under the first field the hint, or
// how many characters are still missing while it has 1 to 11; the note
// about keyboard layouts when it has a character beyond U+0020–U+007E;
// under the second field, once it has something, whether the two match;
// and whether the main button can be pressed. The same password typed two
// ways (é as one sign, or e and its accent) is the same after NFC. A
// password that is not well-formed Unicode (a lone surrogate, which no
// keyboard types but a paste can bring) cannot be pressed through, as a
// short one cannot.
//
// Kept to erasable TypeScript, as the rest of src/vault, so that the checks
// run it in Node as it is (web/tests).

import { beyondLatin, passwordLength, PASSWORD_MAX, PASSWORD_MIN, wellFormed } from "./crypto.ts";

export interface PasswordRule {
  /** Under the first field: the hint, or "{n} more characters". */
  under: { kind: "hint" } | { kind: "short"; n: number };
  /** It has letters beyond Latin ones. */
  latin: boolean;
  /** Under the second field: null while it is empty. */
  match: boolean | null;
  /** No lone surrogate in the first field. */
  wellFormed: boolean;
  /** 12 to 256 characters, well-formed, and the same twice. */
  ok: boolean;
}

export function passwordRule(first: string, again: string): PasswordRule {
  const n = passwordLength(first);
  const formed = wellFormed(first);
  return {
    under: n >= 1 && n < PASSWORD_MIN ? { kind: "short", n: PASSWORD_MIN - n } : { kind: "hint" },
    latin: beyondLatin(first),
    match: again ? first.normalize("NFC") === again.normalize("NFC") : null,
    wellFormed: formed,
    ok: formed && n >= PASSWORD_MIN && n <= PASSWORD_MAX && first.normalize("NFC") === again.normalize("NFC"),
  };
}
