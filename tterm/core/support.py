"""What people write to support from the page (0.1.25): Get help > Write to
support in the account's menu, as on the canvas of 02.11 (row 116 of the
plan, approved 13:24–13:43).

A message goes by email to support's address (support@tterm.net, which
Cloudflare forwards to the owner), answered to the person who wrote it
(Reply-To), and is kept here a year (support_messages). Signed in, the
answer goes to the account's address, and a copy of the message goes there
too: that address is the person's own, checked when they signed in. Before
signing in, in tTerm for Mac, whose engine passes the message on, the
person types an address: nothing goes to it, since nobody checked that it
is theirs, and the limits are tighter.

The technical details are what the page showed the person under "Attach
technical details" (the version, the browser, the plan, how many
machines), one line, and only when they left it ticked: commands, what
they printed and notes never go.
"""
from __future__ import annotations

import datetime as dt
import logging
import unicodedata

import asyncpg

from . import auth, letters
from .accounts import Person
from .mail import MailFailed, Mailer

log = logging.getLogger("tterm.support")

#: The longest message, and the longest line of details.
TEXT_MAX = 5000
DETAILS_MAX = 600
#: Messages in an hour: from one person signed in, from one network before
#: signing in, and from everyone before signing in.
PER_PERSON = 5
PER_NETWORK = 3
UNSIGNED = 30


class Refused(Exception):
    """Not sent; the message says why, `status` is the HTTP status."""

    def __init__(self, message: str, status: int = 422) -> None:
        super().__init__(message)
        self.status = status


#: Characters that turn the text around them: they could make a letter
#: read otherwise than it was written.
BIDI = frozenset("\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069")


def _cleaned(raw: str, line_end: str) -> str:
    """`raw` with its spaces as spaces (a no-break space, a full-width
    one), its line and paragraph separators as `line_end`, and without
    control characters, halves of surrogates and turning marks. What joins
    letters and emoji stays."""
    out = []
    for c in raw.replace("\r\n", "\n").replace("\r", "\n"):
        kind = unicodedata.category(c)
        if c in "\n\t":
            out.append(c if line_end == "\n" else " ")
        elif kind == "Zs":
            out.append(" ")
        elif kind in ("Zl", "Zp"):
            out.append(line_end)
        elif kind not in ("Cc", "Cs") and c not in BIDI:
            out.append(c)
    return "".join(out)


def clean_text(raw: object) -> str:
    """The message as written, its lines ending in \\n; empty if there is
    nothing."""
    if not isinstance(raw, str):
        return ""
    return _cleaned(raw, "\n").strip()


def clean_details(raw: object) -> str:
    """The line of technical details: one line, cut short."""
    if not isinstance(raw, str):
        return ""
    return " ".join(_cleaned(raw, " ").split())[:DETAILS_MAX]


async def write(pool: asyncpg.Pool, mailer: Mailer, *, person: Person | None,
                email: object, text: object, details: object, ip: str,
                support: str, page_url: str,
                now: dt.datetime | None = None) -> dict:
    """Sends a message to support. `person` signed in, or None before
    signing in, when `email` is where the answer goes. What the page says:
    the address the answer goes to, and whether a copy went there."""
    body = clean_text(text)
    if not body:
        raise Refused("Write what happened.")
    if len(body) > TEXT_MAX:
        raise Refused(f"That is too long: up to {TEXT_MAX} characters.")
    line = clean_details(details)
    signed = person is not None and bool(person.email)
    answer = person.email if signed else auth.normalize_email(email)
    if not answer:
        raise Refused("Enter your email: the answer goes there."
                      if not isinstance(email, str) or not email.strip()
                      else "That does not look like an email address.")
    network = "" if signed else auth.network_of(ip)
    async with pool.acquire() as conn, conn.transaction():
        # One at a time, so that the counts hold.
        await conn.execute("LOCK TABLE support_messages IN SHARE ROW EXCLUSIVE MODE")
        if signed:
            sent = await conn.fetchval(
                "SELECT count(*) FROM support_messages WHERE user_id = $1 "
                "AND at > now() - interval '1 hour'", person.id)
            if sent >= PER_PERSON:
                raise Refused("You have written to support several times in "
                              "the last hour. Try again later.", 429)
        else:
            near = await conn.fetchval(
                "SELECT count(*) FROM support_messages WHERE user_id IS NULL "
                "AND network = $1 AND at > now() - interval '1 hour'", network)
            everyone = await conn.fetchval(
                "SELECT count(*) FROM support_messages WHERE user_id IS NULL "
                "AND at > now() - interval '1 hour'")
            if near >= PER_NETWORK or everyone >= UNSIGNED:
                raise Refused("Too many messages to support from here in the "
                              "last hour. Try again later, or write to "
                              f"{support}.", 429)
        message_id = await conn.fetchval(
            "INSERT INTO support_messages (user_id, email, text, details, "
            "network) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            person.id if signed else None, answer, body, line, network)
    at = now or dt.datetime.now(dt.UTC)
    try:
        await mailer.send(letters.support_letter(
            to=support, email=answer,
            name=person.name if signed else "", text=body, details=line,
            account=str(person.id) if signed else "", at=at))
    except MailFailed:
        # Nothing went, so nothing is kept, and it counts towards no limit:
        # the page keeps the text, and says where to write instead.
        log.error("could not send support message %s", message_id)
        await pool.execute("DELETE FROM support_messages WHERE id = $1", message_id)
        raise Refused("Could not send it just now. Try again in a few "
                      f"minutes, or write to {support}.", 503) from None
    await pool.execute("UPDATE support_messages SET sent = true WHERE id = $1",
                       message_id)
    copy = False
    if signed:
        try:
            await mailer.send(letters.support_copy(
                to=answer, text=body, page_url=page_url, support=support))
            copy = True
        except MailFailed:
            # Support has the message; the copy is a convenience.
            log.warning("could not send the copy of support message %s",
                        message_id)
    return {"sent": True, "email": answer, "copy": copy}


