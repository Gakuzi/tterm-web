// Argon2id for the vault password (0.1.26, vault-design.md, v2 "Crypto"):
// the C reference implementation compiled to WebAssembly, from the npm
// package hash-wasm (4.12.0, MIT, no dependencies; its WASM is inside the
// package's JavaScript, nothing is fetched from anywhere). crypto.ts loads
// this module only when a password is needed (a dynamic import, as
// keyfile.ts does with bcrypt-pbkdf), so the page's own script stays as it
// was. Only Argon2id and the BLAKE2b it needs come along: the build leaves
// out hash-wasm's other algorithms.
export { argon2id } from "hash-wasm";
