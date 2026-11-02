-- 0.1.25: what people write to support from the page (Get help > Write to
-- support). Each message goes to support's address by email, answered to
-- the person; it is kept here a year, for the limits an hour and in case
-- the email went astray. One whose email did not go is not kept.
CREATE TABLE support_messages (
    id bigserial PRIMARY KEY,
    at timestamptz NOT NULL DEFAULT now(),
    -- Who wrote, signed in; NULL before signing in (tTerm for Mac).
    user_id uuid REFERENCES users (id) ON DELETE SET NULL,
    -- Where the answer goes.
    email text NOT NULL,
    text text NOT NULL,
    -- What the person chose to attach, as the page showed it to them.
    details text NOT NULL DEFAULT '',
    -- Before signing in, the network it came from (auth.network_of), for
    -- the limit on one network; emptied after a day (auth.sweep).
    network text NOT NULL DEFAULT '',
    -- Whether support's email went out: false only while it is going.
    sent boolean NOT NULL DEFAULT false,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '365 days'
);

CREATE INDEX support_messages_at ON support_messages (at);
