-- 0.1.20: the log of a machine (core/logs.py). Every command run on it
-- through tTerm is a line of the journal; under a line, notes, by a person
-- or by an AI on a person's behalf, answered and never changed. A password
-- or a token that got into a line or a note is redacted by the project's
-- owner or an admin: its words go for good, and who, when and why stays.
--
-- The journal stays append-only. The words of a line or a note live beside
-- it, here, so that they can go while the line stays: the journal row
-- keeps a fingerprint of them, salted, so that a short password cannot be
-- guessed back from it once the words are gone. Redacting empties the
-- words and the salt and says who did it, when and why; nothing else of a
-- text ever changes. A text leaves with its journal row, when that expires.
CREATE TABLE log_texts (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    text        text,
    salt        bytea,
    redacted_at timestamptz,
    redacted_by uuid REFERENCES users (id),
    reason      text CHECK (length(reason) BETWEEN 1 AND 200),
    expires_at  timestamptz NOT NULL,
    CHECK (CASE WHEN redacted_at IS NULL
                THEN text IS NOT NULL AND length(salt) = 16
                     AND redacted_by IS NULL AND reason IS NULL
                ELSE text IS NULL AND salt IS NULL
                     AND redacted_by IS NOT NULL AND reason IS NOT NULL END)
);
CREATE INDEX log_texts_expiry ON log_texts (expires_at);

CREATE FUNCTION log_texts_redact_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.redacted_at IS NULL AND NEW.redacted_at IS NOT NULL
       AND NEW.text IS NULL AND NEW.salt IS NULL
       AND NEW.expires_at = OLD.expires_at THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'the words of the log never change: they may only be redacted, once';
END
$$;
CREATE TRIGGER log_texts_redact_only BEFORE UPDATE ON log_texts
    FOR EACH ROW EXECUTE FUNCTION log_texts_redact_only();

-- Who wrote a row: a person (user_id), an AI on behalf of the person in
-- user_id, never with more rights than theirs, or tTerm itself. `ai` names
-- the model. A row with words (a command, a note) points to them; a note
-- and a redaction point to the line they are about, and leave with it.
ALTER TABLE journal
    ADD COLUMN author text NOT NULL DEFAULT 'person'
        CHECK (author IN ('person', 'ai', 'tterm')),
    ADD COLUMN ai text CHECK (length(ai) BETWEEN 1 AND 100),
    ADD COLUMN text_id bigint REFERENCES log_texts (id),
    ADD COLUMN about bigint REFERENCES journal (id) ON DELETE CASCADE,
    ADD CONSTRAINT journal_ai_for_someone
        CHECK (author <> 'ai' OR (user_id IS NOT NULL AND ai IS NOT NULL));

-- A machine's day; the notes and redactions of a line; the line of a block
-- of a terminal's feed; the rows that keep a text.
CREATE INDEX journal_machine ON journal (machine_id, at)
    WHERE machine_id IS NOT NULL;
CREATE INDEX journal_about ON journal (about) WHERE about IS NOT NULL;
CREATE INDEX journal_block ON journal (terminal_id, ((details->>'seq')::bigint))
    WHERE kind = 'command.ran';
CREATE INDEX journal_text ON journal (text_id) WHERE text_id IS NOT NULL;

-- The commands of the blocks kept from before (the last 30 days) become
-- lines of the log, so that it starts with them and not empty. Each goes in
-- the project its machine was in when it ran, as the line would have then:
-- a machine moved since brings no one there its earlier commands. Each is
-- kept a year from when it ran, as one written now would be. One statement,
-- with the ids of the words drawn first, so that even a long history takes
-- moments.
WITH src AS (
    SELECT bl.terminal_id, bl.seq_start, bl.command, bl.started_by,
           bl.started_at, bl.finished_at, bl.exit_code, bl.cwd, bl.branch,
           t.machine_id, t.home, w.project_id,
           bl.started_at + make_interval(days => p.journal_days) AS expires_at,
           nextval(pg_get_serial_sequence('log_texts', 'id')) AS text_id,
           uuid_send(gen_random_uuid()) AS salt
    FROM blocks bl
    JOIN terminals t ON t.id = bl.terminal_id
    JOIN machines m ON m.id = t.machine_id
    CROSS JOIN LATERAL (
        SELECT COALESCE((
            SELECT (mv.details->>'from')::uuid FROM journal mv
            WHERE mv.machine_id = m.id AND mv.kind = 'machine.moved'
              AND mv.at > bl.started_at
            ORDER BY mv.at, mv.id
            LIMIT 1), m.project_id) AS project_id
    ) w
    JOIN projects p ON p.id = w.project_id
    WHERE bl.kind = 'command' AND bl.started_by IS NOT NULL
      AND btrim(coalesce(bl.command, '')) <> ''
      AND bl.started_at + make_interval(days => p.journal_days) > now()
), words AS (
    INSERT INTO log_texts (id, text, salt, expires_at) OVERRIDING SYSTEM VALUE
    SELECT text_id, command, salt, expires_at FROM src
)
INSERT INTO journal (at, project_id, user_id, kind, machine_id, terminal_id,
                     details, expires_at, author, text_id)
SELECT started_at, project_id, started_by, 'command.ran', machine_id,
       terminal_id,
       jsonb_build_object(
           'seq', seq_start, 'exit', exit_code,
           'ms', CASE WHEN finished_at IS NULL THEN NULL
                 ELSE greatest(0, (extract(epoch FROM finished_at - started_at)
                                   * 1000)::bigint) END,
           'cwd', nullif(cwd, ''), 'branch', nullif(branch, ''),
           'home', nullif(home, ''),
           'fp', encode(sha256(salt || convert_to(command, 'UTF8')), 'hex')),
       expires_at, 'person', text_id
FROM src
ORDER BY started_at, seq_start;
