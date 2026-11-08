import sys
from unittest.mock import AsyncMock, MagicMock
sys.modules["asyncpg"] = MagicMock()

import unittest
import uuid
from datetime import datetime, timezone

from tterm.orchestration.telegram_bot import TelegramBotManager

class TestTelegramBotAdmin(unittest.TestCase):
    def setUp(self):
        self.bot = TelegramBotManager()
        self.bot.pool = MagicMock()
        self.bot.send_message = AsyncMock(return_value={"ok": True})
        self.bot.edit_message = AsyncMock(return_value={"ok": True})
        self.bot.answer_callback = AsyncMock(return_value={"ok": True})

    def test_admin_button_in_main_keyboard(self):
        kb_user = self.bot._main_keyboard(is_owner=False)
        buttons_user = [b["text"] for row in kb_user["inline_keyboard"] for b in row]
        self.assertNotIn("👥 Пользователи", buttons_user)

        kb_owner = self.bot._main_keyboard(is_owner=True)
        buttons_owner = [b["text"] for row in kb_owner["inline_keyboard"] for b in row]
        self.assertIn("👥 Пользователи", buttons_owner)
        self.assertIn("📊 Панель администратора", buttons_owner)

    async def async_test_users_list(self):
        mock_conn = AsyncMock()
        mock_conn.fetchval.return_value = 1
        mock_conn.fetch.return_value = [
            {
                "id": uuid.uuid4(),
                "name": "Тестовый Юзер",
                "email": "test@example.com",
                "plan_id": "pro",
                "telegram_chat_id": "123456",
                "telegram_username": "testuser",
                "is_blocked": False,
                "blocked_until": None,
                "created_at": MagicMock(strftime=lambda fmt: "01.01.2026 12:00")
            }
        ]
        self.bot.pool.acquire.return_value.__aenter__.return_value = mock_conn

        await self.bot._show_admin_users_list(55570186, page=0)
        self.bot.send_message.assert_called_once()
        sent_text = self.bot.send_message.call_args[0][1]
        self.assertIn("Управление пользователями", sent_text)
        self.assertIn("Тестовый Юзер", sent_text)
        self.assertIn("PRO", sent_text)

    async def async_test_user_card(self):
        mock_conn = AsyncMock()
        u_id = uuid.uuid4()
        mock_conn.fetchrow.return_value = {
            "id": u_id,
            "name": "Клиент Иван",
            "email": "ivan@example.com",
            "plan_id": "free",
            "telegram_chat_id": "999888",
            "telegram_username": "ivan_boss",
            "is_blocked": False,
            "blocked_reason": None,
            "blocked_until": None,
            "subscription_expires_at": None,
            "created_at": MagicMock(strftime=lambda fmt: "02.02.2026 14:00")
        }
        mock_conn.fetchval.return_value = 2
        self.bot.pool.acquire.return_value.__aenter__.return_value = mock_conn

        await self.bot._show_admin_user_card(55570186, str(u_id), page=0)
        self.bot.send_message.assert_called_once()
        card_text = self.bot.send_message.call_args[0][1]
        self.assertIn("Досье пользователя", card_text)
        self.assertIn("Клиент Иван", card_text)
        self.assertIn("ivan@example.com", card_text)
        self.assertIn("FREE", card_text)

    async def async_test_block_and_plan_callbacks(self):
        target_id = uuid.uuid4()
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = {
            "id": target_id,
            "name": "Обычный юзер",
            "email": "user@mail.com",
            "telegram_chat_id": "777777",
            "telegram_username": "regular",
            "plan_id": "free",
            "is_blocked": False,
            "blocked_reason": None,
            "blocked_until": None,
            "subscription_expires_at": None,
            "created_at": MagicMock(strftime=lambda fmt: "01.01.2026 10:00")
        }
        mock_conn.fetchval.return_value = 1
        self.bot.pool.acquire.return_value.__aenter__.return_value = mock_conn

        # Test block callback
        cb_block = {
            "id": "cq_1",
            "data": f"u:block:{target_id}:0",
            "message": {"chat": {"id": 55570186}, "message_id": 101},
            "from": {"id": 55570186, "username": "eklimov"}
        }
        await self.bot._handle_callback(cb_block)
        mock_conn.execute.assert_any_call(
            "UPDATE users SET is_blocked = true, blocked_reason = 'Заблокирован администратором', blocked_until = NULL WHERE id = $1",
            target_id
        )

        # Test set_plan callback
        cb_plan = {
            "id": "cq_2",
            "data": f"u:set_plan:{target_id}:enterprise:0",
            "message": {"chat": {"id": 55570186}, "message_id": 101},
            "from": {"id": 55570186, "username": "eklimov"}
        }
        await self.bot._handle_callback(cb_plan)
        mock_conn.execute.assert_any_call(
            "UPDATE users SET plan_id = $1 WHERE id = $2",
            "enterprise", target_id
        )

    def test_all_admin_features(self):
        import asyncio
        asyncio.run(self.async_test_users_list())
        self.bot.send_message.reset_mock()
        asyncio.run(self.async_test_user_card())
        self.bot.send_message.reset_mock()
        asyncio.run(self.async_test_block_and_plan_callbacks())

if __name__ == '__main__':
    unittest.main()
