// bcrypt-pbkdf (Joyent's port of OpenBSD's bcrypt_pbkdf.c) has no types of
// its own: the one function the vault uses (keyfile.ts).
declare module "bcrypt-pbkdf" {
  const lib: {
    /** 0 when done, -1 when the arguments are out of range. */
    pbkdf(pass: Uint8Array, passlen: number, salt: Uint8Array, saltlen: number,
      key: Uint8Array, keylen: number, rounds: number): number;
  };
  export default lib;
}
