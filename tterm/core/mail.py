"""Email: the codes for signing in, and the note about a sign-in from a
device tTerm Web does not know; from 0.1.25 what people write to support,
and its copy for them. What they say and how they look: letters.py.

On the server it goes out through Brevo's API (TTERM_BREVO_KEY), as HTML
with the plain text beside it (from 0.0.11). Without a key, as on the
laptop, each email goes to the log instead, its text, code and all, so that
signing in works there too; the checks read what was "sent" from the same
place.
"""
from __future__ import annotations

import asyncio
import json
import logging
import urllib.error
import urllib.request
from dataclasses import dataclass

log = logging.getLogger("tterm.mail")

BREVO_URL = "https://api.brevo.com/v3/smtp/email"
#: Emails the log mailer keeps for whoever reads them (the checks).
KEPT = 200


class MailFailed(Exception):
    """The email did not go out. The person is told to try again later."""


@dataclass(frozen=True)
class Email:
    to: str
    subject: str
    text: str
    #: The same as HTML, for the mail apps that show it; empty: text only.
    html: str = ""
    #: Where an answer goes, when not to the sender (0.1.25): a message to
    #: support is answered to the person who wrote it.
    reply_to: str = ""


class Mailer:
    async def send(self, email: Email) -> None:
        raise NotImplementedError


class LogMailer(Mailer):
    """Writes each email to the log instead of sending it."""

    def __init__(self) -> None:
        self.sent: list[Email] = []

    async def send(self, email: Email) -> None:
        self.sent.append(email)
        del self.sent[:-KEPT]
        # A warning, so that it shows wherever the core runs: on the laptop
        # this is how the code reaches the person.
        log.warning("email to %s%s: %s\n%s", email.to,
                    f" (reply to {email.reply_to})" if email.reply_to else "",
                    email.subject, email.text)


class BrevoMailer(Mailer):
    """Sends through Brevo's transactional API."""

    def __init__(self, key: str, sender: str) -> None:
        self.key = key
        name, address = parse_sender(sender)
        self.sender = {"name": name, "email": address} if name else {"email": address}

    async def send(self, email: Email) -> None:
        message = {
            "sender": self.sender,
            "to": [{"email": email.to}],
            "subject": email.subject,
            "textContent": email.text,
        }
        if email.html:
            # Both go out as one email; the mail app picks what it shows.
            message["htmlContent"] = email.html
        if email.reply_to:
            message["replyTo"] = {"email": email.reply_to}
        body = json.dumps(message).encode()

        def post() -> int:
            request = urllib.request.Request(
                BREVO_URL, data=body, method="POST",
                headers={"api-key": self.key, "accept": "application/json",
                         "content-type": "application/json"})
            with urllib.request.urlopen(request, timeout=20) as response:
                return response.status

        try:
            status = await asyncio.to_thread(post)
        except urllib.error.HTTPError as exc:
            detail = exc.read()[:300].decode("utf-8", "replace")
            log.error("Brevo refused the email to %s: %s %s", email.to,
                      exc.code, detail)
            raise MailFailed(f"Brevo answered {exc.code}") from None
        except (OSError, urllib.error.URLError) as exc:
            log.error("could not reach Brevo for the email to %s: %s",
                      email.to, exc)
            raise MailFailed("Brevo did not answer") from None
        if status >= 300:
            raise MailFailed(f"Brevo answered {status}")


def parse_sender(sender: str) -> tuple[str, str]:
    """`tTerm <login@tterm.net>` → ("tTerm", "login@tterm.net")."""
    sender = sender.strip()
    if sender.endswith(">") and "<" in sender:
        name, address = sender[:-1].split("<", 1)
        return name.strip(), address.strip()
    return "", sender
