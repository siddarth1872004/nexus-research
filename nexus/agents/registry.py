"""
Agent Registry & Depth Manager
Instantiates all 12 agents and manages active subsets based on research depth.
"""

from typing import Dict, List, Optional
from nexus.agents.base_agent import Agent
from nexus.agents.prompts import AGENT_PROMPTS

AGENT_CONFIGS = [
    {"id": "director",        "name": "Director",        "role": "Task decomposition and orchestration",      "tier": "command",  "colorHex": "#ffffff"},
    {"id": "strategist",      "name": "Strategist",      "role": "Research planning and gap analysis",         "tier": "command",  "colorHex": "#f4f4f5"},
    {"id": "scout",           "name": "Scout",           "role": "Broad reconnaissance",                      "tier": "research", "colorHex": "#e4e4e7"},
    {"id": "deepdiver",       "name": "Deep Diver",      "role": "Targeted deep investigation",               "tier": "research", "colorHex": "#d4d4d8"},
    {"id": "crossreferencer", "name": "Cross-Ref",       "role": "Cross-referencing and linking findings",     "tier": "research", "colorHex": "#a1a1aa"},
    {"id": "pattern",         "name": "Pattern Analyst",  "role": "Trend and pattern identification",         "tier": "analysis", "colorHex": "#ffffff"},
    {"id": "devil",           "name": "Devils Advocate",  "role": "Challenging assumptions and findings",      "tier": "analysis", "colorHex": "#f4f4f5"},
    {"id": "quantifier",      "name": "Quantifier",       "role": "Numerical validation and benchmarking",    "tier": "analysis", "colorHex": "#e4e4e7"},
    {"id": "bias",            "name": "Bias Detector",    "role": "Bias and fallacy identification",           "tier": "analysis", "colorHex": "#d4d4d8"},
    {"id": "factcheck",       "name": "Fact Checker",     "role": "Final verification and confidence scoring", "tier": "output",   "colorHex": "#ffffff"},
    {"id": "synthesizer",     "name": "Synthesizer",      "role": "Report compilation and narrative",          "tier": "output",   "colorHex": "#e4e4e7"},
    {"id": "visualizer",      "name": "Visualizer",       "role": "Data tables and visual summaries",          "tier": "output",   "colorHex": "#d4d4d8"},
    {"id": "editor",          "name": "Editor",           "role": "Style, coherence, and clarity review",      "tier": "output",   "colorHex": "#a1a1aa"},
]

DEPTH_AGENTS = {
    "quick":      ["director", "scout", "synthesizer"],
    "standard":   ["director", "strategist", "scout", "deepdiver", "pattern", "factcheck", "synthesizer", "editor"],
    "deep":       ["director", "strategist", "scout", "deepdiver", "crossreferencer", "pattern", "devil", "quantifier", "factcheck", "synthesizer", "visualizer", "editor"],
    "exhaustive": ["director", "strategist", "scout", "deepdiver", "crossreferencer", "pattern", "devil", "quantifier", "bias", "factcheck", "synthesizer", "visualizer", "editor"],
}


class AgentRegistry:
    def __init__(self):
        self._agents: Dict[str, Agent] = {}
        self._active_ids: set[str] = set()
        self._init_agents()

    def _init_agents(self):
        for cfg in AGENT_CONFIGS:
            agent = Agent(
                agent_id=cfg["id"],
                name=cfg["name"],
                role=cfg["role"],
                tier=cfg["tier"],
                color_hex=cfg["colorHex"],
                system_prompt=AGENT_PROMPTS.get(cfg["id"], ""),
            )
            self._agents[cfg["id"]] = agent

    def get(self, agent_id: str) -> Optional[Agent]:
        return self._agents.get(agent_id)

    def get_all(self) -> List[Agent]:
        return list(self._agents.values())

    def activate_for_depth(self, depth: str) -> List[str]:
        ids = DEPTH_AGENTS.get(depth, DEPTH_AGENTS["standard"])
        self._active_ids = set(ids)
        return ids

    def is_active(self, agent_id: str) -> bool:
        return agent_id in self._active_ids

    def reset_all(self):
        for agent in self._agents.values():
            agent.reset()
        self._active_ids.clear()
