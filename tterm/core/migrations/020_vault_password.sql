-- 0.1.26: the vault password (vault-design.md, "v2: the vault password").
--
-- A vault password replaces the recovery code: the person makes it up when
-- the vault is made, and with it the vault opens in any browser, with no
-- Mac. The client derives everything from it (Argon2id, then HKDF); the
-- core keeps the salt, the Argon2id parameters, the wrap of the vault key
-- and the SHA-256 of the client's proof ("auth"), never the proof itself.
-- The wrap goes only to a session that sends the right proof, and the wrong
-- ones are counted twice. Ten within an hour of each other, and tries pause
-- until an hour after the last (password_wrong, password_wrong_at; a right
-- password starts this count again). Thirty in a day, counted from the
-- first wrong one of the day, and every try waits until that day is over
-- (password_wrong_day, password_wrong_day_at); a right password does not
-- clear this one, only a new password does.
--
-- A vault made before keeps its recovery code until a password is set;
-- setting one clears the code in the same statement. A new vault has none.
-- A vault always has one of the two. The checks are a second line after the
-- core's own (vault.py).

ALTER TABLE vaults
    ALTER COLUMN recovery_salt DROP NOT NULL,
    ALTER COLUMN recovery_wrap DROP NOT NULL,
    ALTER COLUMN recovery_at DROP NOT NULL,
    ALTER COLUMN recovery_at DROP DEFAULT,
    ADD COLUMN password_salt bytea CHECK (length(password_salt) = 16),
    ADD COLUMN password_kdf text CHECK (password_kdf IN ('argon2id')),
    ADD COLUMN password_m integer
        CHECK (password_m BETWEEN 65536 AND 1048576),
    ADD COLUMN password_t integer CHECK (password_t BETWEEN 3 AND 10),
    ADD COLUMN password_p integer CHECK (password_p BETWEEN 1 AND 4),
    ADD COLUMN password_check bytea CHECK (length(password_check) = 32),
    ADD COLUMN password_wrap bytea CHECK (length(password_wrap) = 60),
    ADD COLUMN password_at timestamptz,
    ADD COLUMN password_wrong integer NOT NULL DEFAULT 0
        CHECK (password_wrong >= 0),
    ADD COLUMN password_wrong_at timestamptz,
    ADD COLUMN password_wrong_day integer NOT NULL DEFAULT 0
        CHECK (password_wrong_day >= 0),
    ADD COLUMN password_wrong_day_at timestamptz;

-- The recovery code is there whole or not at all (its salt, its wrap, when
-- it was made); so is the password.
ALTER TABLE vaults ADD CONSTRAINT vaults_recovery_whole CHECK (
    num_nulls(recovery_salt, recovery_wrap, recovery_at) IN (0, 3));
ALTER TABLE vaults ADD CONSTRAINT vaults_password_whole CHECK (
    num_nulls(password_salt, password_kdf, password_m, password_t,
              password_p, password_check, password_wrap, password_at)
        IN (0, 8));

-- A vault has a password or a recovery code (or both, until the first
-- password is set).
ALTER TABLE vaults ADD CONSTRAINT vaults_password_or_recovery CHECK (
    password_salt IS NOT NULL OR recovery_salt IS NOT NULL);
