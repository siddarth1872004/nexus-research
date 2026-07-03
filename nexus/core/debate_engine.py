"""
Adversarial Debate Protocol & Consensus Scoring Engine
"""

import asyncio
import time
import uuid
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class DebateRound(BaseModel):
    agent_id: str
    argument: str
    timestamp: float = Field(default_factory=time.time)


class Debate(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    claim_id: str
    claim_text: str
    challenger_id: str
    defender_id: str
    rounds: List[DebateRound] = Field(default_factory=list)
    status: str = "active"  # active | resolved
    resolution: Optional[str] = None  # accepted | rejected | modified
    final_confidence: Optional[int] = None
    consensus_breakdown: Optional[Dict[str, float]] = None
    max_rounds: int = 3
    created_at: float = Field(default_factory=time.time)
    resolved_at: Optional[float] = None


class DebateEngine:
    def __init__(self):
        self._debates: Dict[str, Debate] = {}
        self._lock = asyncio.Lock()

    async def init_debate(
        self,
        claim_id: str,
        claim_text: str,
        challenger_id: str,
        challenger_arg: str,
        defender_id: str,
    ) -> Debate:
        async with self._lock:
            debate = Debate(
                claim_id=claim_id,
                claim_text=claim_text,
                challenger_id=challenger_id,
                defender_id=defender_id,
                rounds=[DebateRound(agent_id=challenger_id, argument=challenger_arg)],
            )
            self._debates[debate.id] = debate
            return debate

    async def add_round(self, debate_id: str, agent_id: str, argument: str) -> Optional[Debate]:
        async with self._lock:
            debate = self._debates.get(debate_id)
            if debate and debate.status == "active":
                debate.rounds.append(DebateRound(agent_id=agent_id, argument=argument))
            return debate

    async def resolve_debate(self, debate_id: str, scoring: Dict[str, float]) -> Optional[Dict[str, Any]]:
        async with self._lock:
            debate = self._debates.get(debate_id)
            if not debate:
                return None

            weights = {
                "evidence_strength": 0.35,
                "logical_coherence": 0.30,
                "source_diversity": 0.15,
                "counter_arg_quality": 0.20,
            }

            ev = scoring.get("evidence_strength", 0.5)
            lc = scoring.get("logical_coherence", 0.5)
            sd = scoring.get("source_diversity", 0.5)
            cq = scoring.get("counter_arg_quality", 0.5)

            defense_score = (
                (ev * weights["evidence_strength"])
                + (lc * weights["logical_coherence"])
                + (sd * weights["source_diversity"])
                + ((1 - cq) * weights["counter_arg_quality"])
            )

            confidence = round(defense_score * 100)
            if confidence >= 70:
                resolution = "accepted"
            elif confidence >= 40:
                resolution = "modified"
            else:
                resolution = "rejected"

            debate.status = "resolved"
            debate.resolution = resolution
            debate.final_confidence = confidence
            debate.consensus_breakdown = {**scoring, "defense_score": defense_score}
            debate.resolved_at = time.time()

            return {
                "debateId": debate.id,
                "claimId": debate.claim_id,
                "resolution": resolution,
                "confidence": confidence,
                "breakdown": debate.consensus_breakdown,
            }

    async def get_all(self) -> List[Debate]:
        async with self._lock:
            return list(self._debates.values())

    async def clear(self):
        async with self._lock:
            self._debates.clear()
