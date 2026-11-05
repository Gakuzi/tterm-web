"""
Notification and Web Push Hub for tTerm.

Features:
1. Push notifications when long-running terminal commands complete (bell toggle).
2. Drain lock and appeal notifications between administrators and developers.
3. In-app notification history and Web Push event formatting.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set

from .models import NotificationDTO

log = logging.getLogger("tterm.orchestration.notifications")


class NotificationHub:
    """Stores and dispatches in-app and browser push notifications."""

    def __init__(self):
        # terminal_id -> set of user_ids who toggled bell 🔔
        self._terminal_bells: Dict[str, Set[str]] = {}
        # user_id -> list of NotificationDTO
        self._user_notifications: Dict[str, List[NotificationDTO]] = {}

    def toggle_command_bell(self, terminal_id: str, user_id: str) -> bool:
        """Toggles notification bell on for this terminal's active/subsequent command."""
        subscribers = self._terminal_bells.setdefault(terminal_id, set())
        if user_id in subscribers:
            subscribers.remove(user_id)
            active = False
        else:
            subscribers.add(user_id)
            active = True
        log.info("User %s bell toggled to %s on terminal %s", user_id, active, terminal_id)
        return active

    def is_bell_active(self, terminal_id: str, user_id: str) -> bool:
        return user_id in self._terminal_bells.get(terminal_id, set())

    def dispatch_notification(
        self,
        user_id: str,
        notification_type: str,
        title: str,
        body: str,
        entity_id: Optional[str] = None,
    ) -> NotificationDTO:
        """Creates and records a notification for a user."""
        notif_id = str(uuid.uuid4())
        now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
        notif = NotificationDTO(
            id=notif_id,
            user_id=user_id,
            type=notification_type,
            title=title,
            body=body,
            entity_id=entity_id,
            read=False,
            created_at=now_iso,
        )
        self._user_notifications.setdefault(user_id, []).insert(0, notif)
        log.info("Dispatched '%s' notification to %s: %s", notification_type, user_id, title)
        return notif

    def on_command_completed(
        self, terminal_id: str, terminal_name: str, command: str, duration_sec: int, exit_code: int
    ) -> List[NotificationDTO]:
        """Dispatches completion notifications to all users who toggled bell on this terminal."""
        subscribers = self._terminal_bells.pop(terminal_id, set())
        dispatched: List[NotificationDTO] = []
        status_text = "успешно" if exit_code == 0 else f"с ошибкой (код {exit_code})"

        for uid in subscribers:
            notif = self.dispatch_notification(
                user_id=uid,
                notification_type="command_finished",
                title=f"✅ Команда завершена: {command[:40]}",
                body=f"Терминал '{terminal_name}' • Выполнено {status_text} за {duration_sec} сек.",
                entity_id=terminal_id,
            )
            dispatched.append(notif)
        return dispatched

    def get_notifications(self, user_id: str, unread_only: bool = False) -> List[NotificationDTO]:
        notifs = self._user_notifications.get(user_id, [])
        if unread_only:
            return [n for n in notifs if not n.read]
        return notifs

    def mark_read(self, user_id: str, notification_id: str) -> bool:
        for n in self._user_notifications.get(user_id, []):
            if n.id == notification_id:
                n.read = True
                return True
        return False


notification_hub = NotificationHub()
