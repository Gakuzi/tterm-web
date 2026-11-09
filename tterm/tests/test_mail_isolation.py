import asyncio
import unittest
from unittest.mock import patch

from tterm.core.mail import (
    ADMIN_EMAILS,
    Email,
    LogMailer,
    dispatch_telegram_code,
    is_test_email,
    is_test_environment,
)


class TestMailTelegramIsolation(unittest.TestCase):
    def test_test_environment_detection(self):
        """Under unittest runner, test environment must be True."""
        self.assertTrue(is_test_environment())

    def test_test_email_detection(self):
        self.assertTrue(is_test_email("anna@example.com"))
        self.assertTrue(is_test_email("bob@example.com"))
        self.assertTrue(is_test_email("denis@example.com"))
        self.assertTrue(is_test_email("test@example.org"))
        self.assertTrue(is_test_email("v6-0@example.com"))
        self.assertTrue(is_test_email("user@test.local"))

        self.assertFalse(is_test_email("eklimov84@gmail.com"))
        self.assertFalse(is_test_email("klimov@e-klimov.ru"))

    @patch("urllib.request.urlopen")
    def test_dispatch_telegram_code_skips_test_emails(self, mock_urlopen):
        """No HTTP request should ever be sent for test emails or under tests."""
        dispatch_telegram_code("anna@example.com", "tTerm sign-in code: 123456", "Your code is 123456")
        mock_urlopen.assert_not_called()

        dispatch_telegram_code("bob@example.com", "New sign-in to tTerm", "Someone signed in")
        mock_urlopen.assert_not_called()

    @patch("urllib.request.urlopen")
    def test_log_mailer_does_not_dispatch_in_tests(self, mock_urlopen):
        """LogMailer should only write to local list and log, never spam Telegram in tests."""
        mailer = LogMailer()
        email = Email(
            to="anna@example.com",
            subject="Sign-in code 654321",
            text="code: 654321",
        )
        asyncio.run(mailer.send(email))
        self.assertEqual(len(mailer.sent), 1)
        mock_urlopen.assert_not_called()


if __name__ == "__main__":
    unittest.main()
