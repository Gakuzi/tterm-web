-- Adds Telegram bindings to users table for 1-click WebApp login, notifications, and bot terminal orchestration
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_username text;
CREATE INDEX IF NOT EXISTS users_telegram_chat_id ON users (telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;
