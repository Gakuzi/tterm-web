-- 0.1.24: why a terminal ended, when tTerm Web was released. Each start of
-- the core and its version: a start whose version is another than the one
-- before is a release, and the terminals the stop before it ended say
-- "tTerm Web was updated to 0.1.24." instead of "tTerm Web stopped.".
CREATE TABLE core_runs (
    id bigserial PRIMARY KEY,
    version text NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now()
);

-- And the folder a terminal was in when it ended: Open a new terminal
-- starts there.
ALTER TABLE terminals ADD COLUMN last_cwd text;
