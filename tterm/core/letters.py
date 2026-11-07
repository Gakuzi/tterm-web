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


CODE_EMAIL_TRANSLATIONS = {
    "ru": {
        "subject": "{code} — ваш проверочный код для входа в tTerm",
        "title": "Ваш код для входа",
        "text_header": "Ваш проверочный код для входа в tTerm: {code}",
        "lead": "Введите его в браузере, где вы запросили вход. Код действует {minutes} мин.",
        "keep_title": "Никому не сообщайте код.",
        "keep": "tTerm никогда не запрашивает код по телефону или в чатах.",
        "ignore": "Если вы не запрашивали этот код, просто проигнорируйте письмо. Без кода никто не сможет войти.",
        "note": "Вы получили это письмо, потому что на {host} был запрошен код подтверждения для этого адреса.",
    },
    "en": {
        "subject": "{code} is your tTerm sign-in code",
        "title": "Your sign-in code",
        "text_header": "Your tTerm sign-in code: {code}",
        "lead": "Enter it in the browser where you asked for it. It works for {minutes} minutes.",
        "keep_title": "Keep it to yourself.",
        "keep": "tTerm never asks for it by phone or in a chat.",
        "ignore": "If you did not ask for it, ignore this email. Without the code nobody can sign in.",
        "note": "You get this email because someone asked for a sign-in code for this address at {host}.",
    },
    "de": {
        "subject": "{code} ist Ihr tTerm-Anmeldecode",
        "title": "Ihr Anmeldecode",
        "text_header": "Ihr tTerm-Anmeldecode: {code}",
        "lead": "Geben Sie ihn im Browser ein, in dem Sie ihn angefordert haben. Er ist {minutes} Minuten gültig.",
        "keep_title": "Behalten Sie ihn für sich.",
        "keep": "tTerm fragt niemals telefonisch oder im Chat danach.",
        "ignore": "Wenn Sie ihn nicht angefordert haben, ignorieren Sie diese E-Mail. Ohne den Code kann sich niemand anmelden.",
        "note": "Sie erhalten diese E-Mail, da auf {host} ein Anmeldecode für diese Adresse angefordert wurde.",
    },
    "fr": {
        "subject": "{code} est votre code de connexion tTerm",
        "title": "Votre code de connexion",
        "text_header": "Votre code de connexion tTerm : {code}",
        "lead": "Saisissez-le dans le navigateur où vous l'avez demandé. Il est valable {minutes} minutes.",
        "keep_title": "Ne le partagez pas.",
        "keep": "tTerm ne vous le demandera jamais par téléphone ou dans un chat.",
        "ignore": "Si vous n'en êtes pas à l'origine, ignorez cet e-mail. Personne ne peut se connecter sans le code.",
        "note": "Vous recevez cet e-mail car un code de connexion a été demandé pour cette adresse sur {host}.",
    },
    "es": {
        "subject": "{code} es tu código de inicio de sesión de tTerm",
        "title": "Tu código de inicio de sesión",
        "text_header": "Tu código de inicio de sesión de tTerm: {code}",
        "lead": "Introdúcelo en el navegador donde lo solicitaste. Es válido por {minutes} minutos.",
        "keep_title": "Mantenlo en secreto.",
        "keep": "tTerm nunca te lo pedirá por teléfono ni por chat.",
        "ignore": "Si no lo solicitaste, ignora este correo. Nadie puede iniciar sesión sin el código.",
        "note": "Recibes este correo porque alguien solicitó un código de acceso en {host}.",
    },
    "it": {
        "subject": "{code} è il tuo codice di accesso tTerm",
        "title": "Il tuo codice di accesso",
        "text_header": "Il tuo codice di accesso tTerm: {code}",
        "lead": "Inseriscilo nel browser in cui l'hai richiesto. È valido per {minutes} minuti.",
        "keep_title": "Tienilo per te.",
        "keep": "tTerm non lo chiederà mai al telefono o in una chat.",
        "ignore": "Se non l'hai richiesto, ignora questa email. Nessuno può accedere senza il codice.",
        "note": "Ricevi questa email perché è stato richiesto un codice di accesso su {host}.",
    },
    "pt-BR": {
        "subject": "{code} é o seu código de acesso ao tTerm",
        "title": "Seu código de acesso",
        "text_header": "Seu código de acesso ao tTerm: {code}",
        "lead": "Digite-o no navegador em que você o solicitou. Ele é válido por {minutes} minutos.",
        "keep_title": "Mantenha em segredo.",
        "keep": "O tTerm nunca pedirá esse código por telefone ou chat.",
        "ignore": "Se você não solicitou, ignore este e-mail. Ninguém pode entrar sem o código.",
        "note": "Você recebeu este e-mail porque alguém solicitou um código para este endereço em {host}.",
    },
    "pl": {
        "subject": "{code} to Twój kod logowania do tTerm",
        "title": "Twój kod logowania",
        "text_header": "Twój kod logowania do tTerm: {code}",
        "lead": "Wprowadź go w przeglądarce, w której został zażądany. Jest ważny przez {minutes} minut.",
        "keep_title": "Zachowaj go dla siebie.",
        "keep": "tTerm nigdy nie prosi o kod przez telefon ani na czacie.",
        "ignore": "Jeśli to nie Ty prosiłeś o kod, zignoruj tę wiadomość. Nikt nie zaloguje się bez kodu.",
        "note": "Otrzymujesz tę wiadomość, ponieważ zażądano kodu logowania dla tego adresu na {host}.",
    },
    "tr": {
        "subject": "{code} tTerm giriş kodunuzdur",
        "title": "Giriş kodunuz",
        "text_header": "tTerm giriş kodunuz: {code}",
        "lead": "İstekte bulunduğunuz tarayıcıya girin. {minutes} dakika geçerlidir.",
        "keep_title": "Gizli tutun.",
        "keep": "tTerm bu kodu hiçbir zaman telefonla veya sohbet yoluyla istemez.",
        "ignore": "Siz talep etmediyseniz bu e-postayı dikkate almayın. Kod olmadan kimse giriş yapamaz.",
        "note": "Bu e-postayı, {host} üzerinden bu adres için bir giriş kodu istendiği için alıyorsunuz.",
    },
    "zh-CN": {
        "subject": "{code} 是您的 tTerm 登录验证码",
        "title": "您的登录验证码",
        "text_header": "您的 tTerm 登录验证码：{code}",
        "lead": "请在发起请求的浏览器中输入该验证码。有效期为 {minutes} 分钟。",
        "keep_title": "请妥善保管。",
        "keep": "tTerm 绝不会通过电话或即时聊天向您索取验证码。",
        "ignore": "如果您没有发起此请求，请忽略此邮件。没有验证码任何人无法登录。",
        "note": "您收到此邮件是因为有人在 {host} 请求了该邮箱的登录验证码。",
    },
    "ja": {
        "subject": "{code} は tTerm のログインコードです",
        "title": "ログインコード",
        "text_header": "tTerm のログインコード：{code}",
        "lead": "リクエストしたブラウザに入力してください。有効期限は {minutes} 分間です。",
        "keep_title": "大切に保管してください。",
        "keep": "tTerm が電話やチャットでコードを尋ねることは決してありません。",
        "ignore": "心当たりがない場合は、このメールを破棄してください。コードがなければログインできません。",
        "note": "{host} でこのメールアドレス宛てにログインコードがリクエストされたため送信されています。",
    },
    "ko": {
        "subject": "{code} 은(는) tTerm 로그인 코드입니다",
        "title": "로그인 코드",
        "text_header": "tTerm 로그인 코드: {code}",
        "lead": "요청하신 브라우저에 코드를 입력하세요. 유효 시간은 {minutes}분입니다.",
        "keep_title": "안전하게 보관하세요.",
        "keep": "tTerm은 전화나 채팅으로 인증 코드를 요구하지 않습니다.",
        "ignore": "직접 요청하지 않으셨다면 이 이메일을 무시하세요. 코드 없이는 누구도 로그인할 수 없습니다.",
        "note": "{host} 에서 이 주소로 로그인 코드가 요청되어 발송되었습니다.",
    },
}


def normalize_lang(raw: str | None) -> str:
    if not raw:
        return "en"
    clean = raw.strip().lower().replace("_", "-")
    if clean.startswith("zh"):
        return "zh-CN"
    if clean.startswith("pt"):
        return "pt-BR"
    short = clean.split("-")[0]
    if clean in CODE_EMAIL_TRANSLATIONS:
        return clean
    if short in CODE_EMAIL_TRANSLATIONS:
        return short
    return "en"


def code_email(*, to: str, code: str, minutes: int, page_url: str,
               support: str = SUPPORT, lang: str = "en") -> Email:
    """The six digits for signing in localized in the user's selected language.
    The subject starts with them, so that they show in the phone's notification."""
    normalized_lang = normalize_lang(lang)
    tr = CODE_EMAIL_TRANSLATIONS.get(normalized_lang, CODE_EMAIL_TRANSLATIONS["en"])
    host_str = _host(page_url)

    subject = tr["subject"].format(code=code, minutes=minutes, host=host_str)
    lead = tr["lead"].format(code=code, minutes=minutes, host=host_str)
    keep_title = tr["keep_title"]
    keep = tr["keep"]
    ignore = tr["ignore"]
    note = tr["note"].format(host=host_str, code=code, minutes=minutes)
    text_header = tr["text_header"].format(code=code)

    text = (f"{text_header}\n\n{lead}\n\n"
            f"{keep_title} {keep}\n\n{ignore}\n\n{note}\n\n"
            f"{_footer_text(page_url, support)}\n")
    body = (
        _title(tr["title"])
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
          f'<strong>{escape(keep_title)}</strong> {escape(keep)}</p>'
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
