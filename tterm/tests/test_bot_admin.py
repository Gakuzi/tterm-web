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
        self.bot.call_api = AsyncMock(return_value={"ok": True})
        self.bot.send_message = AsyncMock(return_value={"ok": True})
        self.bot.edit_message = AsyncMock(return_value={"ok": True})
        self.bot.answer_callback = AsyncMock(return_value={"ok": True})

    def test_admin_button_in_main_keyboard_strict(self):
        kb_user = self.bot._main_keyboard(is_owner=False)
        buttons_user = [b["text"] for row in kb_user["inline_keyboard"] for b in row]
        self.assertNotIn("👥 Пользователи", buttons_user)
        self.assertNotIn("👑 Панель администратора", buttons_user)
        self.assertNotIn("📈 Метрики", buttons_user)
        self.assertNotIn("🖥 Все машины", buttons_user)
        self.assertIn("🏠 Главное меню", buttons_user)

        kb_owner = self.bot._main_keyboard(is_owner=True)
        buttons_owner = [b["text"] for row in kb_owner["inline_keyboard"] for b in row]
        self.assertIn("👥 Пользователи", buttons_owner)
        self.assertIn("👑 Панель администратора", buttons_owner)
        self.assertIn("📈 Метрики", buttons_owner)
        self.assertIn("🖥 Все машины", buttons_owner)

    def test_rich_main_menu_payload_isolation(self):
        # User payload
        user_row = {"name": "Обычный Юзер", "email": "user@example.com", "plan_id": "free"}
        payload_user = self.bot._build_rich_main_menu_payload(user_row, [], is_owner=False)
        user_callbacks = [
            btn["callback_data"]
            for b in payload_user["blocks"] if b.get("type") == "buttons"
            for btn in b.get("buttons", [])
            if "callback_data" in btn
        ]
        self.assertNotIn("admin:refresh", user_callbacks)
        self.assertNotIn("u:list:0", user_callbacks)
        self.assertNotIn("admin:stats", user_callbacks)
        self.assertNotIn("admin:machines", user_callbacks)
        self.assertIn("menu:machines", user_callbacks)
        self.assertIn("menu:email", user_callbacks)

        # Owner payload
        payload_owner = self.bot._build_rich_main_menu_payload(user_row, [], is_owner=True)
        owner_callbacks = [
            btn["callback_data"]
            for b in payload_owner["blocks"] if b.get("type") == "buttons"
            for btn in b.get("buttons", [])
            if "callback_data" in btn
        ]
        self.assertIn("admin:refresh", owner_callbacks)
        self.assertIn("u:list:0", owner_callbacks)
        self.assertIn("admin:stats", owner_callbacks)
        self.assertIn("admin:machines", owner_callbacks)

    def test_strict_access_control(self):
        # Non-owner
        self.assertFalse(self.bot.is_admin_owner("12345678", from_user={"username": "random_user"}))
        self.assertFalse(self.bot.is_admin_owner("999999", user_row={"email": "attacker@evil.com"}))

        # Owner by chat_id
        self.assertTrue(self.bot.is_admin_owner("55570186"))
        # Owner by username
        self.assertTrue(self.bot.is_admin_owner("111", from_user={"username": "eklimov"}))
        self.assertTrue(self.bot.is_admin_owner("222", from_user={"username": "eklimov84"}))
        # Owner by email
        self.assertTrue(self.bot.is_admin_owner("333", user_row={"email": "eklimov84@xmail.ru"}))

    async def async_test_unauthorized_user_blocked(self):
        # Non-owner tries to open users list
        await self.bot._show_admin_users_list("99999999", page=0)
        self.bot.send_message.assert_called_with("99999999", "⛔ Доступ запрещён. Панель доступна только владельцу платформы.")

        # Non-owner tries callback
        cb_unauth = {
            "id": "cq_hack",
            "data": "u:list:0",
            "message": {"chat": {"id": 99999999}, "message_id": 55},
            "from": {"id": 99999999, "username": "intruder"}
        }
        await self.bot._handle_callback(cb_unauth)
        self.bot.answer_callback.assert_called_with("cq_hack", "⛔ Доступ запрещён. Панель управления доступна только владельцу платформы.", show_alert=True)

    async def async_test_rich_message_users_list(self):
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

        # Call as owner (55570186)
        await self.bot._show_admin_users_list(55570186, page=0)
        # Verify sendRichMessage was called
        self.bot.call_api.assert_called_once()
        call_method = self.bot.call_api.call_args[0][0]
        call_payload = self.bot.call_api.call_args[0][1]

        self.assertEqual(call_method, "sendRichMessage")
        self.assertIn("rich_message", call_payload)
        blocks = call_payload["rich_message"]["blocks"]

        # Verify buttons are inside the rich_message blocks
        has_embedded_button = any(
            any(isinstance(item, dict) and item.get("type") == "button" for item in b.get("text", []))
            for b in blocks if b.get("type") == "paragraph"
        )
        self.assertTrue(has_embedded_button, "Expected embedded button in paragraph")

        has_buttons_block = any(b.get("type") == "buttons" for b in blocks)
        self.assertTrue(has_buttons_block, "Expected buttons block in message bubble")

    async def async_test_rich_message_user_card(self):
        mock_conn = AsyncMock()
        u_id = uuid.uuid4()
        mock_conn.fetchrow.return_value = {
            "id": u_id,
            "name": "Иван Клиент",
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

        # Call as owner (55570186)
        await self.bot._show_admin_user_card(55570186, str(u_id), page=0)
        call_method = self.bot.call_api.call_args[0][0]
        call_payload = self.bot.call_api.call_args[0][1]

        self.assertEqual(call_method, "sendRichMessage")
        blocks = call_payload["rich_message"]["blocks"]

        # Check action buttons block exists
        has_buttons_block = any(b.get("type") == "buttons" for b in blocks)
        self.assertTrue(has_buttons_block)

    async def async_test_main_menu_and_stats(self):
        # 1. Main menu for owner
        self.bot.get_user_by_telegram = AsyncMock(return_value={"id": uuid.uuid4(), "name": "Климов Евгений", "email": "eklimov84@xmail.ru"})
        self.bot.list_user_machines = AsyncMock(return_value=[{"id": "m1", "name": "tterm-vps", "kind": "server", "online": True}])
        await self.bot._show_main_menu(55570186)
        self.bot.call_api.assert_called_with("sendRichMessage", unittest.mock.ANY)
        payload = self.bot.call_api.call_args[0][1]["rich_message"]
        self.assertIn("blocks", payload)

        # 2. Unauthorized callback for stats
        cb_stats = {
            "id": "cq_stats_hack",
            "data": "admin:stats",
            "message": {"chat": {"id": 88888888}, "message_id": 99},
            "from": {"id": 88888888, "username": "hacker"}
        }
        await self.bot._handle_callback(cb_stats)
        self.bot.answer_callback.assert_called_with("cq_stats_hack", "⛔ Доступ запрещён. Панель управления доступна только владельцу платформы.", show_alert=True)

    def test_all_admin_features(self):
        import asyncio
        asyncio.run(self.async_test_unauthorized_user_blocked())
        self.bot.call_api.reset_mock()
        self.bot.send_message.reset_mock()
        asyncio.run(self.async_test_rich_message_users_list())
        self.bot.call_api.reset_mock()
        asyncio.run(self.async_test_rich_message_user_card())
        self.bot.call_api.reset_mock()
        asyncio.run(self.async_test_main_menu_and_stats())

if __name__ == '__main__':
    unittest.main()
