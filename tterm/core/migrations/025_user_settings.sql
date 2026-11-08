-- User Settings & Preferences Database
-- Stores persistent user configuration, notification routing, and client preferences
-- securely associated with the user account without storing plaintext sensitive secrets.

CREATE TABLE IF NOT EXISTS user_settings (
    user_id     uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings (user_id);
