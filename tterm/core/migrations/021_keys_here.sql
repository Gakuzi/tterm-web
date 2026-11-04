-- tTerm Web 0.1.28 (vault-design.md v3): the computer an app's device runs
-- on, as the app said with the computer's own key (POST /api/computers/this,
-- only from the app's session). That session needs no proof of open keys
-- for that computer and for the servers through it; every other device
-- does, to reach them.
ALTER TABLE devices
    ADD COLUMN computer_id uuid REFERENCES machines (id) ON DELETE SET NULL;
