"""Writing to support from the page (0.1.25): Get help > Write to support.
The message goes to support's address, answered to the person; signed in a
copy goes to the account's address; before signing in (tTerm for Mac passes
it on) to nobody but support, with tighter limits; kept a year."""
import datetime as dt
import json

from ..core import auth, letters, mail, support
from .harness import request

CHANGE = {"x-tterm": "1", "content-type": "application/json"}
PAGE = "https://app.tterm.net"
AT = dt.datetime(2026, 11, 2, 15, 30, tzinfo=dt.timezone.utc)
ANON = {**CHANGE, "cookie": ""}


def _body(**fields) -> bytes:
    return json.dumps(fields).encode()


def test_what_is_written_is_cleaned():
    assert support.clean_text("  line one\r\nline\ttwo\x07\x1b[31m  ") == \
        "line one\nline\ttwo[31m"
    assert support.clean_text(" ") == "" and support.clean_text(None) == ""
    assert support.clean_details("tTerm Web 0.1.25 ·\nChrome 141,\x00 macOS") == \
        "tTerm Web 0.1.25 · Chrome 141, macOS"
    assert len(support.clean_details("x" * 5000)) == support.DETAILS_MAX
    assert support.clean_details(42) == ""
    # Spaces of every kind are spaces, not glue; what joins an emoji stays;
    # what would turn the text around goes.
    assert support.clean_text("foo\xa0bar 東京\u3000大阪 a\u2028b \U0001F468\u200d\U0001F4BB "
                              "\u202eevil\u202c \ud800x") == \
        "foo bar 東京 大阪 a\nb \U0001F468\u200d\U0001F4BB evil x"
    assert support.clean_details("Chrome\xa0141,\u2029macOS") == "Chrome 141, macOS"


def test_the_letters_to_support_and_the_copy():
    e = letters.support_letter(
        to="support@tterm.net", email="anna@example.com", name="Anna Smith",
        text="The terminal on web-01 says No connection\nsince the update.",
        details="tTerm Web 0.1.25 · Chrome 141, macOS · Free plan · 3 machines",
        account="11111111-2222-3333-4444-555555555555", at=AT)
    assert e.to == "support@tterm.net" and e.reply_to == "anna@example.com"
    assert e.subject == ("Support: Anna Smith: The terminal on web-01 says "
                         "No connection"), e.subject
    assert "From: Anna Smith <anna@example.com>, account 11111111-" in e.text
    assert "Technical details: tTerm Web 0.1.25 · Chrome 141" in e.text
    assert "2 November 2026, 15:30 UTC" in e.text and not e.html
    # What tTerm knows first, the message under a line: what it says
    # cannot pass for what tTerm knows.
    assert e.text.index("From: Anna") < e.text.index("-" * 60) < \
        e.text.index("The terminal on web-01")
    long = letters.support_letter(to="s@x.net", email="a@b.cd", name="",
                                  text="w" * 200, details="", account="", at=AT)
    assert long.subject.startswith("Support (not signed in): a@b.cd: ")
    assert long.subject.endswith("…") and len(long.subject) < 120
    assert long.text.startswith("NOT SIGNED IN: the address was typed")
    assert "From: a@b.cd\n" in long.text and "Technical details: not attached" in long.text
    copy = letters.support_copy(to="anna@example.com",
                                text="<b>bold</b> & <script>x</script>",
                                page_url=PAGE, support="support@tterm.net")
    assert copy.to == "anna@example.com" and not copy.reply_to
    assert "<script>" not in copy.html and "&lt;script&gt;" in copy.html
    assert "> <b>bold</b> & <script>x</script>" in copy.text
    assert "will answer at anna@example.com" in copy.text
    assert copy.html.count("<a ") == 2, "the page and support, nothing else"


async def test_a_message_from_the_page_goes_to_support(h):
    async with h.core() as core:
        me = core.owner
        before = len(core.mailer.sent)
        r = await request(core.page_port, "POST", "/api/support", headers=CHANGE,
                          body=_body(text="It does not open.\nWhat now?",
                                     details="tTerm Web 0.1.25 · Chrome 141, macOS"))
        assert r.status == 200, r.text
        assert r.json() == {"sent": True, "email": me.email, "copy": True}
        sent = core.mailer.sent[before:]
        assert [e.to for e in sent] == ["support@tterm.net", me.email], sent
        assert sent[0].reply_to == me.email
        assert "It does not open." in sent[0].text and me.name in sent[0].text
        assert "It does not open." in sent[1].text
        row = await core.pool.fetchrow(
            "SELECT user_id, email, text, details, sent, network, expires_at "
            "FROM support_messages")
        assert row["user_id"] == me.id and row["sent"] and row["network"] == ""
        assert row["details"] == "tTerm Web 0.1.25 · Chrome 141, macOS"
        assert row["expires_at"] > dt.datetime.now(dt.UTC) + dt.timedelta(days=360)

        # Nothing written, or too much: not sent.
        r = await request(core.page_port, "POST", "/api/support", headers=CHANGE,
                          body=_body(text="   \n "))
        assert r.status == 422 and "Write what happened" in r.json()["error"]
        r = await request(core.page_port, "POST", "/api/support", headers=CHANGE,
                          body=_body(text="x" * (support.TEXT_MAX + 1)))
        assert r.status == 422 and "too long" in r.json()["error"]
        # Not from another site: the page's header is needed.
        r = await request(core.page_port, "POST", "/api/support",
                          headers={"content-type": "application/json"},
                          body=_body(text="hi"))
        assert r.status == 403, r.status

        # Five an hour from one person.
        for i in range(support.PER_PERSON - 1):
            r = await request(core.page_port, "POST", "/api/support",
                              headers=CHANGE, body=_body(text=f"again {i}"))
            assert r.status == 200, (i, r.text)
        r = await request(core.page_port, "POST", "/api/support", headers=CHANGE,
                          body=_body(text="one more"))
        assert r.status == 429 and "last hour" in r.json()["error"]
        # The sweep keeps them a year.
        await core.pool.execute("UPDATE support_messages SET expires_at = now() "
                                "WHERE text = 'again 0'")
        await auth.sweep(core.pool)
        texts = [x["text"] for x in await core.pool.fetch(
            "SELECT text FROM support_messages")]
        assert "again 0" not in texts and "again 1" in texts


async def test_before_signing_in_the_answer_goes_to_the_address_typed(h):
    async with h.core() as core:
        before = len(core.mailer.sent)
        r = await request(core.page_port, "POST", "/api/support", headers=ANON,
                          body=_body(text="Cannot sign in."))
        assert r.status == 422 and "Enter your email" in r.json()["error"]
        r = await request(core.page_port, "POST", "/api/support", headers=ANON,
                          body=_body(text="Cannot sign in.", email="bob at example"))
        assert r.status == 422 and "does not look like an email" in r.json()["error"]
        r = await request(core.page_port, "POST", "/api/support", headers=ANON,
                          body=_body(text="Cannot sign in.", email="Bob@Example.com",
                                     details="tTerm for Mac 0.8.0 · not signed in"))
        assert r.status == 200, r.text
        assert r.json() == {"sent": True, "email": "bob@example.com", "copy": False}
        sent = core.mailer.sent[before:]
        # Nothing to an address nobody checked: support alone.
        assert [e.to for e in sent] == ["support@tterm.net"]
        assert sent[0].reply_to == "bob@example.com"
        assert sent[0].subject == "Support (not signed in): bob@example.com: Cannot sign in."
        assert sent[0].text.startswith("NOT SIGNED IN") and "From: bob@example.com" in sent[0].text
        row = await core.pool.fetchrow(
            "SELECT user_id, network FROM support_messages")
        assert row["user_id"] is None and row["network"], row
        # Three an hour from one network.
        for i in range(support.PER_NETWORK - 1):
            r = await request(core.page_port, "POST", "/api/support", headers=ANON,
                              body=_body(text=f"again {i}", email="bob@example.com"))
            assert r.status == 200, (i, r.text)
        r = await request(core.page_port, "POST", "/api/support", headers=ANON,
                          body=_body(text="more", email="bob@example.com"))
        assert r.status == 429 and "support@tterm.net" in r.json()["error"]
        # Signed in, the person's own limit is another.
        r = await request(core.page_port, "POST", "/api/support", headers=CHANGE,
                          body=_body(text="signed in", email="ignored@example.com"))
        assert r.status == 200 and r.json()["email"] == core.owner.email
        # A session that has ended asks to sign in again: its message is not
        # one from someone who never signed in.
        before = len(core.mailer.sent)
        ended = {**CHANGE, "cookie": f"{auth.SESSION_COOKIE}=ended-long-ago"}
        r = await request(core.page_port, "POST", "/api/support", headers=ended,
                          body=_body(text="still me", email="bob@example.com"))
        assert r.status == 401 and r.json().get("signedOut") is True, r.text
        assert len(core.mailer.sent) == before
        # The network counts for its hour, and is not kept past a day.
        await core.pool.execute("UPDATE support_messages SET at = now() - interval '2 days' "
                                "WHERE user_id IS NULL")
        await auth.sweep(core.pool)
        assert await core.pool.fetchval(
            "SELECT count(*) FROM support_messages WHERE network <> ''") == 0
        assert await core.pool.fetchval(
            "SELECT count(*) FROM support_messages WHERE user_id IS NULL") == 3


async def test_before_signing_in_all_together_have_a_limit(h):
    async with h.core() as core:
        per_network, unsigned = support.PER_NETWORK, support.UNSIGNED
        support.PER_NETWORK, support.UNSIGNED = 100, 2
        try:
            for i in range(2):
                r = await request(core.page_port, "POST", "/api/support", headers=ANON,
                                  body=_body(text=f"from afar {i}", email=f"p{i}@example.com"))
                assert r.status == 200, r.text
            r = await request(core.page_port, "POST", "/api/support", headers=ANON,
                              body=_body(text="one too many", email="p3@example.com"))
            assert r.status == 429, r.text
            # Signed in is another count.
            r = await request(core.page_port, "POST", "/api/support", headers=CHANGE,
                              body=_body(text="signed in"))
            assert r.status == 200, r.text
        finally:
            support.PER_NETWORK, support.UNSIGNED = per_network, unsigned


async def test_a_message_that_does_not_go_out_says_so(h):
    async with h.core() as core:
        works = core.mailer.send

        async def broken(email):
            raise mail.MailFailed("Brevo answered 401")
        core.mailer.send = broken
        try:
            r = await request(core.page_port, "POST", "/api/support",
                              headers=CHANGE, body=_body(text="hello"))
        finally:
            core.mailer.send = works
        assert r.status == 503 and "support@tterm.net" in r.json()["error"], r.text
        # Nothing went, so nothing is kept, and it counts towards no limit.
        assert await core.pool.fetchval("SELECT count(*) FROM support_messages") == 0

        # The copy failing is not the message failing.
        calls = []

        async def no_copy(email):
            calls.append(email.to)
            if email.to != "support@tterm.net":
                raise mail.MailFailed("Brevo answered 500")
            await works(email)
        core.mailer.send = no_copy
        try:
            r = await request(core.page_port, "POST", "/api/support",
                              headers=CHANGE, body=_body(text="again"))
        finally:
            core.mailer.send = works
        assert r.status == 200 and r.json()["copy"] is False, r.text
        assert calls == ["support@tterm.net", core.owner.email]
        assert await core.pool.fetchval(
            "SELECT count(*) FROM support_messages WHERE sent") == 1
