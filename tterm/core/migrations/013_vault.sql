-- 0.1.17: the vault of SSH keys, and servers that open "from anywhere".
--
-- A person's SSH private keys live in their vault, encrypted end to end: the
-- server keeps only sealed blobs, the wraps of the vault key for each way of
-- opening it (a browser's passkey, the Mac's keychain, a recovery code), the
-- salts, and the public halves. It never sees a private key or the vault key
-- in the clear. See core/vault.py and the contract (vault-design.md).
--
-- The sizes here are the contract's: the vault key is 32 bytes, so a wrap of
-- it (box = nonce(12) || ciphertext(32) || tag(16)) is exactly 60 bytes; a
-- commit and an X25519 public key are 32 bytes; a sealed private key is at
-- most 16 KB. The checks are a second line after the core's own (vault.py);
-- nothing sealed is ever logged.

-- One vault per account. prf_salt is the server's (the PRF input for a
-- browser's passkey lock); the recovery salt and wrap are the recovery
-- code's lock on the vault key, shown once and replaceable.
CREATE TABLE vaults (
    id              uuid PRIMARY KEY,
    user_id         uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
    prf_salt        bytea NOT NULL CHECK (length(prf_salt) = 32),
    recovery_salt   bytea NOT NULL CHECK (length(recovery_salt) = 16),
    recovery_wrap   bytea NOT NULL CHECK (length(recovery_wrap) = 60),
    created_at      timestamptz NOT NULL DEFAULT now(),
    recovery_at     timestamptz NOT NULL DEFAULT now()
);

-- A lock is the vault key wrapped for one way of opening it: a browser's
-- passkey (the PRF output makes the key-encryption key) or the Mac's
-- keychain (the app). The id is the client's; a browser's lock is tied to
-- this session's device. Removed locks stay for the record, with removed_at.
CREATE TABLE vault_locks (
    id              uuid PRIMARY KEY,
    vault_id        uuid NOT NULL REFERENCES vaults (id) ON DELETE CASCADE,
    kind            text NOT NULL CHECK (kind IN ('passkey', 'app')),
    device_id       uuid REFERENCES devices (id) ON DELETE SET NULL,
    label           text NOT NULL DEFAULT '',
    credential_id   bytea,
    wrap            bytea NOT NULL CHECK (length(wrap) = 60),
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_used_at    timestamptz NOT NULL DEFAULT now(),
    removed_at      timestamptz
);
CREATE INDEX vault_locks_vault ON vault_locks (vault_id) WHERE removed_at IS NULL;

-- A private key in the vault: its public half in the clear (OpenSSH one
-- line, with its fingerprint and type), and the private key sealed with the
-- vault key. The id is the client's, picked before upload. A fingerprint is
-- one key: the same key is not stored twice in a vault.
CREATE TABLE vault_keys (
    id              uuid PRIMARY KEY,
    vault_id        uuid NOT NULL REFERENCES vaults (id) ON DELETE CASCADE,
    name            text NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
    type            text NOT NULL CHECK (type IN ('ssh-ed25519',
                        'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ssh-rsa')),
    public_key      text NOT NULL,
    fingerprint     text NOT NULL,
    sealed          bytea NOT NULL CHECK (length(sealed) <= 16384),
    source          text NOT NULL CHECK (source IN ('mac', 'file')),
    source_label    text NOT NULL DEFAULT '',
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_used_at    timestamptz,
    removed_at      timestamptz
);
CREATE UNIQUE INDEX vault_keys_fingerprint ON vault_keys (vault_id, fingerprint)
    WHERE removed_at IS NULL;

-- Pairing a new browser (B) with the vault open on the Mac (A). B commits to
-- its X25519 public key, A answers with its own, B reveals (checked against
-- the commit), both show the same six digits, A seals the vault key for B.
-- The state machine is strict: five minutes, one answer, one reveal, one
-- approval; deny ends B's session. session_id is B's.
CREATE TABLE vault_pairings (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    session_id  uuid NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    commit      bytea NOT NULL CHECK (length(commit) = 32),
    pub_a       bytea CHECK (pub_a IS NULL OR length(pub_a) = 32),
    pub_b       bytea CHECK (pub_b IS NULL OR length(pub_b) = 32),
    sealed      bytea CHECK (sealed IS NULL OR length(sealed) = 60),
    state       text NOT NULL DEFAULT 'waiting' CHECK (state IN (
                    'waiting', 'answered', 'revealed', 'approved', 'denied',
                    'expired')),
    device      text NOT NULL DEFAULT '',
    method      text NOT NULL DEFAULT '',
    ip          text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL
);
CREATE INDEX vault_pairings_user ON vault_pairings (user_id, created_at DESC);

-- How a server is signed in to. Existing rows stay 'cert', as for machines
-- added with Add machine: a 2-minute certificate of tTerm Web's CA.
--   'cert': tTerm's CA line in the person's own authorized_keys.
--   'key':  the person's own key in the vault; the login is signed by their
--           device and relayed over the page's socket (vault_key_id).
--   'mac':  a terminal on the person's Mac (via_machine_id, a computer) that
--           runs ssh to ssh_target.
-- A server behind a bastion keeps the jump host it is reached through.
ALTER TABLE machines
    ADD COLUMN login_method text NOT NULL DEFAULT 'cert'
        CHECK (login_method IN ('cert', 'key', 'mac')),
    ADD COLUMN vault_key_id uuid REFERENCES vault_keys (id),
    ADD COLUMN jump_host text,
    ADD COLUMN jump_port integer CHECK (jump_port IS NULL
                                        OR jump_port BETWEEN 1 AND 65535),
    ADD COLUMN jump_login text,
    ADD COLUMN jump_host_keys text[] NOT NULL DEFAULT '{}',
    ADD COLUMN via_machine_id uuid REFERENCES machines (id),
    ADD COLUMN ssh_target text;
