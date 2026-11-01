-- 0.1.17, after the security review of 01.11: what is removed from the
-- vault is deleted, not only marked (the Privacy Policy says "deleted").
-- A removed key keeps its row (the journal, and the machines that still
-- point to it and say "key removed") but not its sealed private key; a
-- removed lock keeps its row but not the wrap of the vault key nor its
-- passkey's credential id. A removed row must hold none of them, so a
-- removal that forgot to wipe would fail here; one still in use must.

ALTER TABLE vault_keys ALTER COLUMN sealed DROP NOT NULL;
ALTER TABLE vault_keys DROP CONSTRAINT IF EXISTS vault_keys_sealed_check;
UPDATE vault_keys SET sealed = NULL WHERE removed_at IS NOT NULL;
ALTER TABLE vault_keys ADD CONSTRAINT vault_keys_sealed_check CHECK (
    (removed_at IS NULL AND sealed IS NOT NULL
        AND length(sealed) BETWEEN 1 AND 16384)
    OR (removed_at IS NOT NULL AND sealed IS NULL));

ALTER TABLE vault_locks ALTER COLUMN wrap DROP NOT NULL;
ALTER TABLE vault_locks DROP CONSTRAINT IF EXISTS vault_locks_wrap_check;
UPDATE vault_locks SET wrap = NULL, credential_id = NULL
    WHERE removed_at IS NOT NULL;
ALTER TABLE vault_locks ADD CONSTRAINT vault_locks_wrap_check CHECK (
    (removed_at IS NULL AND wrap IS NOT NULL AND length(wrap) = 60)
    OR (removed_at IS NOT NULL AND wrap IS NULL AND credential_id IS NULL));
