"""
Priority Task Queue with Dependency Resolution
"""

import asyncio
import time
import uuid
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class Task(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    description: str
    priority: int = 3
    dependencies: List[str] = Field(default_factory=list)
    agent_type: Optional[str] = None
    assigned_agent: Optional[str] = None
    status: str = "pending"  # pending | assigned | running | complete | failed
    result: Optional[Any] = None
    created_at: float = Field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None


class TaskQueue:
    def __init__(self):
        self._tasks: Dict[str, Task] = {}
        self._lock = asyncio.Lock()

    async def enqueue(
        self,
        description: str,
        priority: int = 3,
        dependencies: Optional[List[str]] = None,
        agent_type: Optional[str] = None,
    ) -> Task:
        async with self._lock:
            task = Task(
                description=description,
                priority=priority,
                dependencies=dependencies or [],
                agent_type=agent_type,
            )
            self._tasks[task.id] = task
            return task

    async def dequeue(self, agent_type: Optional[str] = None) -> Optional[Task]:
        async with self._lock:
            best: Optional[Task] = None
            for task in self._tasks.values():
                if task.status != "pending":
                    continue
                if agent_type and task.agent_type and task.agent_type != agent_type:
                    continue
                if not self._deps_resolved(task):
                    continue
                if not best or task.priority < best.priority:
                    best = task
            return best

    async def assign(self, task_id: str, agent_id: str) -> Optional[Task]:
        async with self._lock:
            task = self._tasks.get(task_id)
            if task:
                task.status = "assigned"
                task.assigned_agent = agent_id
                task.started_at = time.time()
            return task

    async def mark_complete(self, task_id: str, result: Any = None):
        async with self._lock:
            task = self._tasks.get(task_id)
            if task:
                task.status = "complete"
                task.result = result
                task.completed_at = time.time()

    async def mark_failed(self, task_id: str, error: Any = None):
        async with self._lock:
            task = self._tasks.get(task_id)
            if task:
                task.status = "failed"
                task.result = str(error)
                task.completed_at = time.time()

    def _deps_resolved(self, task: Task) -> bool:
        for dep_id in task.dependencies:
            dep = self._tasks.get(dep_id)
            if not dep or dep.status != "complete":
                return False
        return True

    async def get_all(self) -> List[Task]:
        async with self._lock:
            return list(self._tasks.values())

    async def clear(self):
        async with self._lock:
            self._tasks.clear()
