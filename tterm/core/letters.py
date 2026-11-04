"""The emails tTerm Web sends, in the look approved on 17.10.2026: the
code for signing in, and the note about a sign-in from a browser tTerm Web
did not know. From 0.1.25 also what someone wrote to support from the page,
plain text for support, and the copy for them in the same look.

Each goes as HTML and, beside it, the same words as plain text: for mail
apps that show only that, and for the log on the laptop, where the code is
read from the subject. The HTML is what mail apps understand: tables for
the layout, the styles on each element, the system's fonts, and the logo
as a PNG from the page's own address (/mail/logo.png). Nothing in it counts
opens or clicks. It asks to stay light in a dark mail app, as approved.

Everything that comes from outside is escaped, the address and the
browser's name and IP above all: an email in tTerm's name with someone
else's link in it would be a gift to whoever wants passwords.
"""
from __future__ import annotations

import datetime as dt
from html import escape
from urllib.parse import urlsplit

from .mail import Email

#: Support's address, when the settings give none.
SUPPORT = "support@tterm.net"
#: Where the page serves the logo the emails show.
LOGO_PATH = "/mail/logo.png"

INK = "#15171C"
DIM = "#545B67"
FAINT = "#5F6673"
EDGE = "#E8EAEE"
GROUND = "#F3F4F6"
LINK = "#93560A"
FONT = ("-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, "
        "sans-serif")
MONO = ("'SF Mono', Menlo, Consolas, 'Liberation Mono', 'Courier New', "
        "monospace")

MONTHS = ("January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December")


def when(moment: dt.datetime) -> str:
    """'17 October 2026, 17:54 UTC', the same in every locale."""
    moment = moment.astimezone(dt.timezone.utc)
    return (f"{moment.day} {MONTHS[moment.month - 1]} {moment.year}, "
            f"{moment:%H:%M} UTC")


def code_email(*, to: str, code: str, minutes: int, page_url: str,
               support: str = SUPPORT) -> Email:
    """The six digits for signing in. The subject starts with them, so that
    they show in the phone's notification."""
    subject = f"{code} is your tTerm sign-in code"
    lead = (f"Enter it in the browser where you asked for it. It works for "
            f"{minutes} minutes.")
    keep = "tTerm never asks for it by phone or in a chat."
    ignore = ("If you did not ask for it, ignore this email. Without the "
              "code nobody can sign in.")
    # Not the address itself: anyone may ask for a code to any address, and
    # what they typed is no part of an email in tTerm's name.
    note = (f"You get this email because someone asked for a sign-in code "
            f"for this address at {_host(page_url)}.")
    text = (f"Your tTerm sign-in code: {code}\n\n{lead}\n\n"
            f"Keep it to yourself: {keep}\n\n{ignore}\n\n{note}\n\n"
            f"{_footer_text(page_url, support)}\n")
    body = (
        _title("Your sign-in code")
        + _lead(escape(lead))
        + _gap(24)
        + '<table role="presentation" width="100%" cellpadding="0" '
          'cellspacing="0" border="0"><tr>'
          f'<td class="tt-code" align="center" style="padding:22px 0 22px 14px;'
          'background:#FCF4E8;border:1px solid #F3D7AE;border-radius:12px;'
          f'font-family:{MONO};font-size:40px;line-height:1;font-weight:700;'
          f'letter-spacing:14px;color:{INK};">{escape(code)}</td>'
          '</tr></table>'
        + f'<p style="margin:24px 0 0;padding:14px 16px;background:{GROUND};'
          f'border-radius:10px;font-size:14px;line-height:1.55;color:{INK};">'
          f'<strong>Keep it to yourself.</strong> {escape(keep)}</p>'
        + f'<p style="margin:16px 0 0;font-size:14px;line-height:1.6;'
          f'color:{DIM};">{escape(ignore)}</p>')
    return Email(to=to, subject=subject, text=text,
                 html=_page(subject=subject, preheader=lead, body=body,
                            note=note, page_url=page_url, support=support))


def sign_in_email(*, to: str, label: str, ip: str, at: dt.datetime,
                  page_url: str, support: str = SUPPORT,
                  app: bool = False) -> Email:
    """The note about a sign-in with a code from this address, in a
    browser tTerm Web did not know: what it was, and what to do if it was
    not the person. Forget all devices is on Settings (from 0.1.4; before
    that on the account page), and from 0.1.27 the link opens Settings at
    Devices. From 0.1.6 also about an app on a computer that a browser
    signed in to the account allowed (`app`)."""
    subject = "New sign-in to tTerm"
    if app:
        lead = (f"{label} signed in as {to}: a browser signed in to this "
                "account allowed it.")
        rows = [("App", label)]
        step1 = ("Open Settings in tTerm and forget the app under Devices, or "
                 "press Forget all devices: every browser and app signs out.")
        note = (f"tTerm writes to {to} about every sign-in from a browser or "
                "an app it did not know.")
    else:
        lead = f"Someone signed in as {to} with a code from this email."
        rows = [("Browser", label)]
        step1 = ("Open Settings in tTerm and press Forget all devices: every "
                 "browser signs out.")
        note = (f"tTerm writes to {to} about every sign-in from a browser it "
                "did not know.")
    if ip:
        rows.append(("Address", ip))
    rows.append(("Time", when(at)))
    settings = page_url.rstrip("/") + "/settings/devices"
    step2 = ("Change the password of this email, because whoever signed in "
             "could read it.")
    text = ("New sign-in to tTerm\n\n"
            f"{lead}\n\n"
            + "".join(f"{name}: {value}\n" for name, value in rows)
            + "\nIf it was you, there is nothing to do.\n\n"
            "If it was not you:\n"
            f"1. {step1} {settings}\n"
            f"2. {step2}\n\n"
            f"{note}\n\n"
            f"{_footer_text(page_url, support)}\n")
    cells = ""
    for i, (name, value) in enumerate(rows):
        below = "0" if i == len(rows) - 1 else "8px"
        cells += (f'<tr><td style="padding:0 16px {below} 0;width:72px;'
                  f'color:{FAINT};vertical-align:top;">{escape(name)}</td>'
                  f'<td style="padding:0 0 {below} 0;font-weight:600;'
                  f'color:{INK};">{escape(value)}</td></tr>')
    body = (
        _title(subject)
        + _lead(escape(lead))
        + _gap(24)
        + '<table role="presentation" width="100%" cellpadding="0" '
          f'cellspacing="0" border="0" style="'
          f'background:{GROUND};border-radius:12px;"><tr>'
          '<td style="padding:16px 20px;">'
          '<table role="presentation" cellpadding="0" cellspacing="0" '
          f'border="0" style="font-family:{FONT};font-size:14px;'
          f'line-height:1.5;">{cells}</table>'
          '</td></tr></table>'
        + f'<p style="margin:24px 0 0;font-size:15px;line-height:1.6;'
          f'color:{INK};">If it was you, there is nothing to do.</p>'
        + _gap(20)
        + '<table role="presentation" width="100%" cellpadding="0" '
          f'cellspacing="0" border="0" style="'
          f'border:1px solid {EDGE};border-radius:12px;"><tr>'
          '<td style="padding:18px 20px;">'
          f'<p style="margin:0;font-size:15px;line-height:1.4;font-weight:700;'
          f'color:{INK};">If it was not you</p>'
          f'<ol style="margin:10px 0 0;padding-left:20px;font-size:14px;'
          f'line-height:1.6;color:{DIM};">'
          f'<li>{escape(step1)}</li>'
          f'<li style="margin-top:6px;">{escape(step2)}</li></ol>'
          + _gap(18)
          + '<table role="presentation" cellpadding="0" cellspacing="0" '
          'border="0"><tr>'
          # bgcolor and mso-padding-alt: Outlook for Windows ignores the
          # link's own padding and would shrink the button to its words.
          '<td bgcolor="#E9A33F" style="border-radius:10px;'
          'background:#E9A33F;mso-padding-alt:13px 22px;">'
          f'<a href="{escape(settings)}" style="display:inline-block;'
          f'padding:13px 22px;font-family:{FONT};font-size:15px;'
          'line-height:20px;font-weight:700;color:#0D0E11;'
          'text-decoration:none;border-radius:10px;">Open Settings</a>'
          '</td></tr></table>'
          '</td></tr></table>')
    return Email(to=to, subject=subject, text=text,
                 html=_page(subject=subject, preheader=lead, body=body,
                            note=note, page_url=page_url, support=support))


def support_letter(*, to: str, email: str, name: str, text: str,
                   details: str, account: str, at: dt.datetime) -> Email:
    """What someone wrote to support from the page (0.1.25): plain text,
    for support's mailbox; an answer goes to them (Reply-To). `account` is
    their account's id, empty before signing in; `details` what they chose
    to attach, as the page showed it to them.

    What tTerm knows comes first, the message under a line: whatever the
    message says, it cannot pass for that. Before signing in the address
    is only what was typed, and the subject and the first line say so."""
    first = next((line.strip() for line in text.splitlines() if line.strip()), "")
    if len(first) > 70:
        first = first[:69].rstrip() + "…"
    if account:
        head = "Support"
        facts = [f"From: {name} <{email}>, account {account}, signed in"]
    else:
        head = "Support (not signed in)"
        facts = ["NOT SIGNED IN: the address was typed, nobody has checked "
                 "that it is theirs.",
                 f"From: {email}"]
    who = name or email
    subject = f"{head}: {who}: {first}" if first else f"{head}: {who}"
    facts += [f"Technical details: {details or 'not attached'}",
              f"Sent: {when(at)}",
              f"Answer this email: the answer goes to {email}."]
    body = "\n".join(facts) + "\n\n" + "-" * 60 + "\n\n" + text + "\n"
    return Email(to=to, subject=subject, text=body, reply_to=email)


def support_copy(*, to: str, text: str, page_url: str,
                 support: str = SUPPORT) -> Email:
    """The copy of a message to support, for the person who wrote it, at
    their account's address (0.1.25)."""
    subject = "Your message to tTerm support"
    lead = f"We got it and will answer at {to}. This is what you wrote."
    note = ("tTerm sends this copy to the address of the account the "
            "message was written from.")
    plain = ("We got your message\n\n"
             f"{lead}\n\n"
             + "".join(f"> {line}\n" for line in text.splitlines())
             + f"\n{note}\n\n{_footer_text(page_url, support)}\n")
    body = (
        _title("We got your message")
        + _lead(escape(lead))
        + _gap(20)
        + '<table role="presentation" width="100%" cellpadding="0" '
          f'cellspacing="0" border="0" style="'
          f'background:{GROUND};border-radius:12px;"><tr>'
          f'<td style="padding:16px 20px;font-family:{FONT};font-size:14px;'
          f'line-height:1.6;color:{INK};white-space:pre-wrap;'
          f'word-break:break-word;">{escape(text)}</td>'
          '</tr></table>')
    return Email(to=to, subject=subject, text=plain,
                 html=_page(subject=subject, preheader=lead, body=body,
                            note=note, page_url=page_url, support=support))


# ----------------------------------------------------------------- parts

def _host(page_url: str) -> str:
    return urlsplit(page_url).netloc or page_url


def _footer_text(page_url: str, support: str) -> str:
    return f"tTerm Web · {page_url} · {support}"


def _gap(px: int) -> str:
    """Space between blocks: a margin on a table is lost in Outlook."""
    return (f'<div style="height:{px}px;line-height:{px}px;font-size:1px;">'
            '&nbsp;</div>')


def _title(text: str) -> str:
    return (f'<h1 class="tt-title" style="margin:36px 0 0;font-size:26px;'
            f'line-height:1.25;font-weight:700;color:{INK};">'
            f'{escape(text)}</h1>')


def _lead(html: str) -> str:
    return (f'<p style="margin:10px 0 0;font-size:15px;line-height:1.6;'
            f'color:{DIM};">{html}</p>')


def _page(*, subject: str, preheader: str, body: str, note: str,
          page_url: str, support: str) -> str:
    """The frame both emails share: the light ground, the card with the
    logo, the footer with the page and support, a line under the card."""
    base = page_url.rstrip("/")
    logo = escape(base + LOGO_PATH)
    # What the mail app shows next to the subject; the spaces after it keep
    # the body's first words out of that preview.
    spacer = "&zwnj;&nbsp;" * 40
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<title>{escape(subject)}</title>
<style>
body {{ margin: 0; padding: 0; }}
a[x-apple-data-detectors] {{ color: inherit !important; text-decoration: none !important; }}
@media (max-width: 520px) {{
  .tt-card {{ padding: 28px 22px 24px !important; }}
  .tt-title {{ margin-top: 28px !important; font-size: 23px !important; }}
  .tt-code {{ font-size: 34px !important; letter-spacing: 10px !important; padding-left: 10px !important; }}
}}
</style>
<!--[if mso]>
<style>
body, table, td, p, a, h1, li, strong {{ font-family: 'Segoe UI', Arial, sans-serif !important; }}
.tt-code {{ font-family: Consolas, 'Courier New', monospace !important; }}
</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background:{GROUND};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:{GROUND};">{escape(preheader)}{spacer}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{GROUND};">
<tr><td align="center" style="padding:32px 12px;">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
<tr><td class="tt-card" style="padding:40px 44px 32px;background:#FFFFFF;border:1px solid {EDGE};border-radius:16px;font-family:{FONT};color:{INK};text-align:left;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:middle;"><img src="{logo}" width="36" height="36" alt="" style="display:block;width:36px;height:36px;border:0;outline:none;"></td>
<td style="vertical-align:middle;padding-left:10px;font-family:{FONT};font-size:21px;line-height:1;font-weight:800;letter-spacing:-0.2px;color:{INK};">tTerm</td>
</tr></table>
{body}
<div style="height:1px;line-height:1px;font-size:1px;margin:32px 0 20px;background:{EDGE};">&nbsp;</div>
<p style="margin:0;font-size:12px;line-height:1.8;color:{FAINT};">tTerm Web · <a href="{escape(page_url)}" style="color:{LINK};text-decoration:none;">{escape(_host(page_url))}</a> · <a href="mailto:{escape(support)}" style="color:{LINK};text-decoration:none;">{escape(support)}</a></p>
</td></tr>
<tr><td style="padding:16px 8px 0;font-family:{FONT};font-size:12px;line-height:1.6;color:{FAINT};text-align:center;">{escape(note)}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>
"""
