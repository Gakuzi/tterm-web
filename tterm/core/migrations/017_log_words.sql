-- 0.1.21: the words of the machines' logs, looked for. Find in this log and
-- search look for a word anywhere in a line's command or in a note, as
-- search does in blocks (011): a trigram index keeps that quick over a year
-- of lines. Without pg_trgm it still works, only slower on a long log.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        CREATE INDEX log_texts_words ON log_texts
            USING gin (text gin_trgm_ops);
    END IF;
END
$$;
