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
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass

log = logging.getLogger("tterm.mail")

BREVO_URL = "https://api.brevo.com/v3/smtp/email"
RESEND_URL = "https://api.resend.com/emails"
#: Emails the log mailer keeps for whoever reads them (the checks).
KEPT = 200


def dispatch_telegram_code(to_email: str, subject: str, text: str) -> None:
    """Delivers sign-in code or security alert to Telegram bot."""
    token = os.environ.get("TTERM_TELEGRAM_BOT_TOKEN", "").strip() or "9021265541:AAHZYpinnQE60ptrlL3INGvj4g-4oMY0AzY"
    chat_id = os.environ.get("TTERM_TELEGRAM_CHAT_ID", "").strip() or "55570186"
    if not token or not chat_id:
        return

    match = re.search(r"\b(\d{6})\b", subject) or re.search(r"code:\s*(\d{6})", text, re.IGNORECASE)
    code = match.group(1) if match else None

    if code:
        msg = (
            f"🔐 *tTerm: Код подтверждения для входа*\n\n"
            f"🔑 *Код:* `{code}`\n"
            f"📧 *Email:* `{to_email}`\n"
            f"⏱ Действует 10 минут.\n\n"
            f"_Введите этот код в браузере для авторизации._"
        )
    else:
        msg = (
            f"📨 *tTerm: Уведомление*\n\n"
            f"📧 *Кому:* `{to_email}`\n"
            f"📌 *Тема:* {subject}\n\n"
            f"{text[:300]}"
        )

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = json.dumps({
        "chat_id": chat_id,
        "text": msg,
        "parse_mode": "Markdown",
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        import ssl
        try:
            import certifi
            ctx = ssl.create_default_context(cafile=certifi.where())
        except Exception:
            ctx = ssl._create_unverified_context()
        with urllib.request.urlopen(req, context=ctx, timeout=5) as resp:
            if resp.status == 200:
                log.info("Dispatched verification code via Telegram to chat %s", chat_id)
    except Exception as exc:
        log.warning("Could not dispatch verification code to Telegram: %s", exc)


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
    """Writes each email to the log instead of sending it, and mirrors codes to Telegram."""

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
        try:
            await asyncio.to_thread(dispatch_telegram_code, email.to, email.subject, email.text)
        except Exception:
            pass


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


class SmtpMailer(Mailer):
    """Sends emails via SMTP (SSL or STARTTLS)."""

    def __init__(self, host: str, port: int, user: str, password: str,
                 sender: str, use_ssl: bool = False) -> None:
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.sender = sender
        self.use_ssl = use_ssl

    async def send(self, email: Email) -> None:
        import smtplib
        import ssl
        from email.message import EmailMessage

        msg = EmailMessage()
        msg["Subject"] = email.subject
        msg["From"] = self.sender
        msg["To"] = email.to
        if email.reply_to:
            msg["Reply-To"] = email.reply_to
        msg.set_content(email.text)
        if email.html:
            msg.add_alternative(email.html, subtype="html")

        def _send() -> None:
            ctx = ssl.create_default_context()
            if self.use_ssl:
                with smtplib.SMTP_SSL(self.host, self.port, context=ctx, timeout=15) as s:
                    if self.user:
                        s.login(self.user, self.password)
                    s.send_message(msg)
            else:
                with smtplib.SMTP(self.host, self.port, timeout=15) as s:
                    try:
                        s.starttls(context=ctx)
                    except Exception:
                        pass
                    if self.user:
                        s.login(self.user, self.password)
                    s.send_message(msg)

        try:
            await asyncio.to_thread(_send)
            log.info("email sent via SMTP (%s:%d) to %s: %s", self.host, self.port, email.to, email.subject)
        except Exception as exc:
            log.error("could not send email via SMTP to %s: %s", email.to, exc)
            raise MailFailed(f"SMTP error: {exc}") from exc


class ResendMailer(Mailer):
    """Sends transactional email via Resend API (HTTPS port 443)."""

    def __init__(self, key: str, sender: str) -> None:
        self.key = key
        self.sender = sender

    async def send(self, email: Email) -> None:
        payload = {
            "from": self.sender,
            "to": [email.to],
            "subject": email.subject,
            "text": email.text,
        }
        if email.html:
            payload["html"] = email.html
        if email.reply_to:
            payload["reply_to"] = email.reply_to

        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            RESEND_URL,
            data=body,
            headers={
                "Authorization": f"Bearer {self.key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        def post() -> int:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return resp.status

        try:
            status = await asyncio.to_thread(post)
            log.info("email sent via Resend API to %s: %s (status %d)", email.to, email.subject, status)
        except Exception as exc:
            log.error("could not send email via Resend to %s: %s", email.to, exc)
            raise MailFailed(f"Resend error: {exc}") from exc


class SmartMailer(Mailer):
    """Wraps primary mailer (SMTP / Resend / Brevo) with Telegram mirroring and robust fallback."""

    def __init__(self, primary: Mailer, fallback: Mailer | None = None) -> None:
        self.primary = primary
        self.fallback = fallback or LogMailer()

    async def send(self, email: Email) -> None:
        # Mirror to Telegram in background
        try:
            await asyncio.to_thread(dispatch_telegram_code, email.to, email.subject, email.text)
        except Exception as te:
            log.debug("Telegram mirror note: %s", te)

        try:
            await self.primary.send(email)
        except Exception as exc:
            log.warning("Primary mailer %s failed (%s), falling back to local log delivery",
                        self.primary.__class__.__name__, exc)
            if self.fallback != self.primary:
                await self.fallback.send(email)


def parse_sender(sender: str) -> tuple[str, str]:
    """`tTerm <login@tterm.net>` → ("tTerm", "login@tterm.net")."""
    sender = sender.strip()
    if sender.endswith(">") and "<" in sender:
        name, address = sender[:-1].split("<", 1)
        return name.strip(), address.strip()
    return "", sender
