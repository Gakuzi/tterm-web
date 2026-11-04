"""The emails (from 0.0.11): what they say as text and as HTML, that both
say the same, and that nothing from outside gets into the HTML as markup."""
import datetime as dt

from ..core import letters

PAGE = "https://app.tterm.net"
AT = dt.datetime(2026, 10, 17, 17, 54, tzinfo=dt.timezone.utc)


def test_the_code_email_has_the_code_in_both_parts():
    e = letters.code_email(to="anna@example.com", code="256592", minutes=10,
                           page_url=PAGE, support="support@tterm.net")
    # The code first, so that it shows in the phone's notification.
    assert e.subject == "256592 is your tTerm sign-in code", e.subject
    assert "Your tTerm sign-in code: 256592" in e.text, e.text
    assert "10 minutes" in e.text and "Keep it to yourself" in e.text
    assert PAGE in e.text and "support@tterm.net" in e.text
    assert ">256592</td>" in e.html
    assert "10 minutes" in e.html and "Keep it to yourself." in e.html
    assert f'src="{PAGE}/mail/logo.png"' in e.html
    assert 'href="mailto:support@tterm.net"' in e.html
    # Not the address someone typed: "this address", in both parts.
    assert "for this address at app.tterm.net" in e.html
    assert "for this address at app.tterm.net" in e.text
    assert "anna@example.com" not in e.html and "anna@example.com" not in e.text
    # Outlook for Windows: a frame of 600 px and its own fonts.
    assert '<!--[if mso]><table role="presentation" width="600"' in e.html
    assert "Consolas" in e.html
    # Light, as approved: a dark mail app is asked to keep it so.
    assert '<meta name="color-scheme" content="light">' in e.html
    # One picture, the logo: nothing that counts opens.
    assert e.html.count("<img ") == 1
    # Only support at the bottom (the owner, 17.10).
    assert "Terms of Service" not in e.html and "Privacy Policy" not in e.html
    assert e.html.count("<a ") == 2, e.html.count("<a ")


def test_the_sign_in_email_says_what_and_what_to_do():
    e = letters.sign_in_email(to="anna@example.com", label="Safari on iPhone",
                              ip="203.0.113.24", at=AT, page_url=PAGE,
                              support="support@tterm.net")
    assert e.subject == "New sign-in to tTerm"
    for part in (e.text, e.html):
        assert "Safari on iPhone" in part and "203.0.113.24" in part, part
        assert "17 October 2026, 17:54 UTC" in part, part
        assert "Forget all devices" in part and "anna@example.com" in part
    # The button and the text lead straight to Settings, where Forget all
    # devices is (0.1.4), from 0.1.27 at Devices; the button keeps its size
    # in Outlook too.
    assert f'href="{PAGE}/settings/devices"' in e.html
    assert f"{PAGE}/settings/devices" in e.text
    assert "Open Settings in tTerm" in e.text and ">Open Settings</a>" in e.html
    assert 'bgcolor="#E9A33F"' in e.html and "mso-padding-alt" in e.html
    assert "about every sign-in from a browser it did not know" in e.text
    assert e.html.count("<img ") == 1 and e.html.count("<a ") == 3
    # Without an address, no line for it.
    quiet = letters.sign_in_email(to="anna@example.com", label="Chrome on Linux",
                                  ip="", at=AT, page_url=PAGE)
    assert "Address" not in quiet.text and ">Address<" not in quiet.html
    # Support's address when none is given.
    assert "support@tterm.net" in quiet.text
    # The time in UTC, whatever zone it came in, and in English anywhere.
    moscow = dt.timezone(dt.timedelta(hours=3))
    assert letters.when(dt.datetime(2026, 10, 18, 1, 5, tzinfo=moscow)) == (
        "17 October 2026, 22:05 UTC")


def test_nothing_from_outside_becomes_markup():
    """The browser's name comes from what the browser says about itself, the
    address from what someone typed: neither may become a link in an email
    sent in tTerm's name."""
    link = '<a href="https://evil.example">Secure your account</a>'
    e = letters.sign_in_email(to='x"<b>@example.com', label=link,
                              ip='1.2.3.4"><img src=x>', at=AT, page_url=PAGE)
    assert 'href="https://evil.example"' not in e.html
    assert "&lt;a href=&quot;https://evil.example&quot;&gt;" in e.html
    assert "<img src=x>" not in e.html and "<b>" not in e.html
    assert e.html.count("<img ") == 1 and e.html.count("<a ") == 3
    code = letters.code_email(to='x"<b>@example.com', code="123456",
                              minutes=10, page_url=PAGE)
    assert "<b>" not in code.html and code.html.count("<a ") == 2
