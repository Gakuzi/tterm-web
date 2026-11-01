-- 0.1.17, after the security review of 01.11: a server the person added
-- themselves (POST /api/machines/own) is always dialled the checked way
-- (core/reach.py): its name resolved once and the address checked at every
-- terminal it opens, a 'cert' one with no bastion too, whose name could
-- later be pointed at an address inside tTerm Web's own network. Servers of
-- Add machine stay as they are: their address came from the server itself.
ALTER TABLE machines ADD COLUMN own_server boolean NOT NULL DEFAULT false;

-- Those added before this mark: the ones only the person's own way makes.
UPDATE machines SET own_server = true
    WHERE login_method <> 'cert' OR jump_host IS NOT NULL;
