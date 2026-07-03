"""
Base Agent Implementation
Sliding memory window, status lifecycle, JSON parsing, and async Gemini call wrappers.
"""

import json
import logging
from typing import Dict, List, Any, Optional
from nexus.api.gemini_client import gemini_client
from nexus.core.rate_limiter import rate_limiter

logger = logging.getLogger("nexus.agent")


class Agent:
    def __init__(
        self,
        agent_id: str,
        name: str,
        role: str,
        tier: str,
        color_hex: str,
        system_prompt: str,
        max_memory: int = 3,
    ):
        self.agent_id = agent_id
        self.name = name
        self.role = role
        self.tier = tier
        self.color_hex = color_hex
        self.system_prompt = system_prompt
        self.max_memory = max_memory

        self.status = "idle"  # idle | thinking | debating | complete | error
        self.current_task: Optional[str] = None
        self.last_output: Optional[str] = None
        self.memory: List[Dict[str, str]] = []

    async def think(self, prompt: str) -> str:
        self.status = "thinking"
        self.memory.append({"role": "user", "text": prompt})
        self._trim_memory()

        priority = 1 if self.tier == "command" else (2 if self.tier == "research" else 3)
        await rate_limiter.acquire(priority)

        try:
            response = await gemini_client.generate(
                system_prompt=self.system_prompt,
                messages=self.memory,
            )
            self.memory.append({"role": "model", "text": response})
            self._trim_memory()
            self.last_output = response
            self.status = "complete"
            return response
        except Exception as e:
            self.status = "error"
            logger.error(f"Agent '{self.agent_id}' error: {e}")
            raise e
        finally:
            rate_limiter.release()

    def parse_json_response(self, text: str) -> Optional[Dict[str, Any]]:
        if not text:
            return None
        cleaned = text.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            logger.warning(f"Agent '{self.agent_id}' output failed to parse as JSON")
            return None

    def reset(self):
        self.memory.clear()
        self.status = "idle"
        self.current_task = None
        self.last_output = None

    def _trim_memory(self):
        max_entries = self.max_memory * 2
        if len(self.memory) > max_entries:
            self.memory = self.memory[-max_entries:]
