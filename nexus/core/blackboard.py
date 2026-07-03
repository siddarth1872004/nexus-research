"""
Async Shared Blackboard Memory System
Four shared data structures: knowledge_base, task_queue, debate_board, claim_ledger
"""

import asyncio
import time
import uuid
from typing import Dict, List, Any, Callable, Optional
from pydantic import BaseModel, Field


class BlackboardEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    timestamp: float = Field(default_factory=time.time)
    data: Dict[str, Any] = Field(default_factory=dict)


class Blackboard:
    def __init__(self):
        self._sections: Dict[str, List[Dict[str, Any]]] = {
            "knowledgeBase": [],
            "taskQueue": [],
            "debateBoard": [],
            "claimLedger": [],
        }
        self._listeners: Dict[str, List[Callable]] = {
            "knowledgeBase": [],
            "taskQueue": [],
            "debateBoard": [],
            "claimLedger": [],
        }
        self._lock = asyncio.Lock()

    async def post(self, section: str, data: Dict[str, Any]) -> Dict[str, Any]:
        async with self._lock:
            entry = {
                "id": str(uuid.uuid4())[:8],
                "timestamp": time.time(),
                **data,
            }
            if section in self._sections:
                self._sections[section].append(entry)
                self._notify(section, entry)
            return entry

    async def query(self, section: str, filter_fn: Optional[Callable] = None) -> List[Dict[str, Any]]:
        async with self._lock:
            data = self._sections.get(section, [])
            if filter_fn:
                return [e for e in data if filter_fn(e)]
            return list(data)

    async def update(self, section: str, entry_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        async with self._lock:
            data = self._sections.get(section, [])
            for entry in data:
                if entry.get("id") == entry_id:
                    entry.update(updates)
                    entry["updatedAt"] = time.time()
                    return entry
            return None

    async def get_counts(self) -> Dict[str, int]:
        async with self._lock:
            return {k: len(v) for k, v in self._sections.items()}

    async def clear(self):
        async with self._lock:
            for k in self._sections:
                self._sections[k].clear()

    def subscribe(self, section: str, callback: Callable):
        if section in self._listeners:
            self._listeners[section].append(callback)

    def _notify(self, section: str, entry: Dict[str, Any]):
        for cb in self._listeners.get(section, []):
            try:
                if asyncio.iscoroutinefunction(cb):
                    asyncio.create_task(cb(section, entry))
                else:
                    cb(section, entry)
            except Exception as e:
                pass


blackboard = Blackboard()
