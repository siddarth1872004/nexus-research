"""
Async DAG Wave Scheduler
Topologically sorts async task nodes into parallel waves and executes with asyncio.gather
"""

import asyncio
import logging
from typing import Dict, List, Callable, Any, Set, Optional

logger = logging.getLogger("nexus.scheduler")


class DAGNode:
    def __init__(self, node_id: str, fn: Callable, deps: Optional[List[str]] = None):
        self.node_id = node_id
        self.fn = fn
        self.deps = deps or []
        self.status = "pending"  # pending | running | complete | failed | skipped
        self.result: Any = None
        self.error: Optional[Exception] = None


class Scheduler:
    def __init__(self):
        self._nodes: Dict[str, DAGNode] = {}

    def add_node(self, node_id: str, fn: Callable, deps: Optional[List[str]] = None):
        self._nodes[node_id] = DAGNode(node_id, fn, deps)

    async def execute((self) -> Dict[str, Any]):
        pass

    async def execute(self) -> Dict[str, Any]:
        results: Dict[str, Any] = {}

        while True:
            ready: List[DAGNode] = []
            has_pending = False

            for node in self._nodes.values():
                if node.status == "pending":
                    has_pending = True
                    deps_ok = all(
                        dep_id in self._nodes
                        and self._nodes[dep_id].status in ("complete", "failed")
                        for dep_id in node.deps
                    )
                    if deps_ok:
                        ready.append(node)

            if not ready:
                if not has_pending:
                    break
                logger.warning("Scheduler deadlock or unresolvable dependencies")
                break

            # Execute wave concurrently
            tasks = []
            for node in ready:
                node.status = "running"
                tasks.append(self._run_node(node))

            await asyncio.gather(*tasks, return_exceptions=True)

            for node in ready:
                if node.status == "complete":
                    results[node.node_id] = node.result

        return results

    async def _run_node(self, node: DAGNode):
        try:
            node.result = await node.fn()
            node.status = "complete"
        except Exception as e:
            node.status = "failed"
            node.error = e
            logger.error(f"Node '{node.node_id}' failed: {e}")

    def clear(self):
        self._nodes.clear()
