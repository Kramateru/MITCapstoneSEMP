"""
Lightweight in-memory live update manager for dashboard push notifications.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Any, DefaultDict, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class LiveUpdateManager:
    """Tracks WebSocket subscribers and broadcasts dashboard events."""

    def __init__(self) -> None:
        self._channels: DefaultDict[str, Set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, channel: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._channels[channel].add(websocket)
        logger.info("Live update client connected to %s", channel)

    async def disconnect(self, channel: str, websocket: WebSocket) -> None:
        async with self._lock:
            self._channels[channel].discard(websocket)
        logger.info("Live update client disconnected from %s", channel)

    async def broadcast(self, channel: str, payload: dict[str, Any]) -> None:
        async with self._lock:
            recipients = list(self._channels.get(channel, set()))

        stale_connections: list[WebSocket] = []
        for websocket in recipients:
            try:
                await websocket.send_json(payload)
            except Exception:
                stale_connections.append(websocket)

        if stale_connections:
            async with self._lock:
                for websocket in stale_connections:
                    self._channels[channel].discard(websocket)

    async def broadcast_training_update(self, payload: dict[str, Any]) -> None:
        await self.broadcast("trainers", payload)
        await self.broadcast("admins", payload)


live_update_manager = LiveUpdateManager()
