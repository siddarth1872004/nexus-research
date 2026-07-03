"""
Claim Ledger Module
Tracks claims, evidence chains, contributing agents, and confidence scores.
"""

import asyncio
import time
import uuid
from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class Claim(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    text: str
    confidence: int = 50
    source_agent: str
    contributing_agents: List[str] = Field(default_factory=list)
    topic: str = ""
    evidence: List[str] = Field(default_factory=list)
    debate_id: Optional[str] = None
    status: str = "unverified"  # unverified | disputed | verified | rejected
    created_at: float = Field(default_factory=time.time)


class ClaimLedger:
    def __init__(self):
        self._claims: Dict[str, Claim] = {}
        self._lock = asyncio.Lock()

    async def add_claim(
        self,
        text: str,
        confidence: int = 50,
        source_agent: str = "",
        topic: str = "",
        evidence: Optional[List[str]] = None,
    ) -> Claim:
        async with self._lock:
            claim = Claim(
                text=text,
                confidence=confidence,
                source_agent=source_agent,
                contributing_agents=[source_agent] if source_agent else [],
                topic=topic,
                evidence=evidence or [],
            )
            self._claims[claim.id] = claim
            return claim

    async def update_confidence(self, claim_id: str, new_confidence: int, agent_id: Optional[str] = None):
        async with self._lock:
            claim = self._claims.get(claim_id)
            if claim:
                claim.confidence = max(0, min(100, new_confidence))
                if agent_id and agent_id not in claim.contributing_agents:
                    claim.contributing_agents.append(agent_id)

    async def set_status(self, claim_id: str, status: str, debate_id: Optional[str] = None):
        async with self._lock:
            claim = self._claims.get(claim_id)
            if claim:
                claim.status = status
                if debate_id:
                    claim.debate_id = debate_id

    async def get_sorted(self) -> List[Claim]:
        async with self._lock:
            return sorted(self._claims.values(), key=lambda c: c.confidence, reverse=True)

    async def get_all(self) -> List[Claim]:
        async with self._lock:
            return list(self._claims.values())

    async def get_by_id(self, claim_id: str) -> Optional[Claim]:
        async with self._lock:
            return self._claims.get(claim_id)

    async def clear(self):
        async with self._lock:
            self._claims.clear()
