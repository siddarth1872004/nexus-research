"""
Research Pipeline Orchestrator in Python
Coordinates 8-phase DAG research workflow across all active agents.
Sends real-time event callbacks for WebSockets/UI.
"""

import asyncio
import logging
import time
from typing import Callable, Optional, Dict, Any, List

from nexus.agents.registry import AgentRegistry
from nexus.core.blackboard import blackboard
from nexus.core.claim_ledger import ClaimLedger
from nexus.core.debate_engine import DebateEngine

logger = logging.getLogger("nexus.pipeline")

PHASE_NAMES = [
    "Decomposition",
    "Reconnaissance",
    "Deep Research",
    "Analysis",
    "Debate",
    "Verification",
    "Synthesis",
    "Polish",
]


class Pipeline:
    def __init__(self, registry: AgentRegistry):
        self.registry = registry
        self.debate_engine = DebateEngine()
        self.claim_ledger = ClaimLedger()
        self._event_callback: Optional[Callable] = None
        self._is_running = False
        self._current_task: Optional[asyncio.Task] = None

    def set_event_callback(self, callback: Callable):
        self._event_callback = callback

    async def _emit_event(self, event_type: str, data: Dict[str, Any]):
        if self._event_callback:
            try:
                if asyncio.iscoroutinefunction(self._event_callback):
                    await self._event_callback(event_type, data)
                else:
                    self._event_callback(event_type, data)
            except Exception as e:
                logger.error(f"Event callback error: {e}")

    async def start(self, query: str, depth: str = "standard") -> str:
        self._is_running = True
        start_time = time.time()

        await blackboard.clear()
        await self.debate_engine.clear()
        await self.claim_ledger.clear()

        active_ids = self.registry.activateForDepth(depth) if hasattr(self.registry, "activateForDepth") else self.registry.activate_for_depth(depth)

        await self._emit_event("start", {
            "query": query,
            "depth": depth,
            "activeAgents": active_ids,
            "phases": [{"name": p, "status": "pending"} for p in PHASE_NAMES],
        })

        try:
            if depth == "quick":
                report = await self._run_quick_pipeline(query)
            else:
                report = await self._run_full_pipeline(query, depth)

            elapsed = round(time.time() - start_time, 1)
            await self._emit_event("complete", {
                "reportMarkdown": report,
                "elapsed": elapsed,
            })
            return report

        except Exception as e:
            logger.error(f"Pipeline execution failed: {e}")
            await self._emit_event("error", {"error": str(e)})
            raise e
        finally:
            self._is_running = False

    async def _run_quick_pipeline(self, query: str) -> str:
        director = self.registry.get("director")
        scout = self.registry.get("scout")
        synthesizer = self.registry.get("synthesizer")

        # Phase 1: Decomposition
        await self._set_phase(0, "active")
        await self._feed("director", "Analyzing query and planning research...", PHASE_NAMES[0])
        plan_raw = await director.think(f'Research query: "{query}"\n\nDecompose into 3 subtasks max for quick research.')
        plan = director.parse_json_response(plan_raw)
        await self._set_phase(0, "complete")

        # Phase 2: Reconnaissance
        await self._set_phase(1, "active")
        subtasks = plan.get("subtasks", [{"description": query}]) if plan else [{"description": query}]
        await self._feed("scout", f"Investigating {len(subtasks)} subtask(s)...", PHASE_NAMES[1])

        findings = []
        for task in subtasks:
          desc = task.get("description", query) if isinstance(task, dict) else str(task)
          raw = await scout.think(f'Investigate research subtask: "{desc}"')
          parsed = scout.parse_json_response(raw)
          if parsed and "findings" in parsed:
              findings.extend(parsed["findings"])

        await self._set_phase(1, "complete")

        # Phase 7: Synthesis
        await self._set_phase(6, "active")
        await self._feed("synthesizer", "Compiling quick research report...", PHASE_NAMES[6])
        summary_text = "\n".join([f"- [{f.get('topic', 'General')}] {f.get('content', '')}" for f in findings])
        report = await synthesizer.think(f'Original query: "{query}"\n\nFindings:\n{summary_text}\n\nCompile report.')
        await self._set_phase(6, "complete")

        return report

    async def _run_full_pipeline(self, query: str, depth: str) -> str:
        director = self.registry.get("director")
        scout = self.registry.get("scout")
        strategist = self.registry.get("strategist")
        deepdiver = self.registry.get("deepdiver")
        crossref = self.registry.get("crossreferencer")
        pattern_agent = self.registry.get("pattern")
        quant_agent = self.registry.get("quantifier")
        devil_agent = self.registry.get("devil")
        bias_agent = self.registry.get("bias")
        factchecker = self.registry.get("factcheck")
        synthesizer = self.registry.get("synthesizer")
        viz_agent = self.registry.get("visualizer")
        editor_agent = self.registry.get("editor")

        all_findings: List[Dict[str, Any]] = []
        all_claims: List[Dict[str, Any]] = []
        analysis_results: Dict[str, Any] = {}
        debate_results: List[Dict[str, Any]] = []
        verified_claims: List[Dict[str, Any]] = []

        # ========== Phase 1: Decomposition ==========
        await self._set_phase(0, "active")
        await self._feed("director", "Analyzing query and decomposing into subtasks...", PHASE_NAMES[0])
        plan_raw = await director.think(f'Research query: "{query}"\n\nDecompose into structured plan.')
        plan = director.parse_json_response(plan_raw)
        subtasks = plan.get("subtasks", [{"description": query}]) if plan else [{"description": query}]
        await self._feed("director", f"Created {len(subtasks)} research subtasks", PHASE_NAMES[0])
        await self._set_phase(0, "complete")

        # ========== Phase 2: Reconnaissance ==========
        await self._set_phase(1, "active")
        await self._feed("scout", "Beginning broad reconnaissance sweep...", PHASE_NAMES[1])

        async def _scout_task(task_def):
            desc = task_def.get("description", query) if isinstance(task_def, dict) else str(task_def)
            raw = await scout.think(f'Investigate subtask: "{desc}"\nContext: "{query}"')
            return scout.parse_json_response(raw)

        scout_results = await asyncio.gather(*[_scout_task(t) for t in subtasks], return_exceptions=True)
        for res in scout_results:
            if isinstance(res, dict) and "findings" in res:
                all_findings.extend(res["findings"])
                for f in res["findings"]:
                    await blackboard.post("knowledgeBase", {
                        "topic": f.get("topic", ""),
                        "content": f.get("content", ""),
                        "sourceAgent": "scout",
                        "confidence": f.get("confidence", 0.7),
                    })

        if self.registry.is_active("strategist") and strategist:
            await self._feed("strategist", "Analyzing plan for knowledge gaps...", PHASE_NAMES[1])
            await strategist.think(f'Subtasks: {subtasks}\n\nSuggest strategic adjustments.')

        await self._feed("scout", f"Gathered {len(all_findings)} initial findings", PHASE_NAMES[1])
        await self._set_phase(1, "complete")

        # ========== Phase 3: Deep Research ==========
        await self._set_phase(2, "active")
        if self.registry.is_active("deepdiver") and deepdiver:
            await self._feed("deepdiver", "Conducting targeted deep dives...", PHASE_NAMES[2])
            findings_text = "\n".join([f"- [{f.get('topic', '')}] {f.get('content', '')}" for f in all_findings[:8]])
            deep_topics = [t.get("description", query) if isinstance(t, dict) else str(t) for t in subtasks[:3]]

            for topic in deep_topics:
                raw = await deepdiver.think(f'Investigate deeply: "{topic}"\n\nFindings context:\n{findings_text}')
                parsed = deepdiver.parse_json_response(raw)
                if parsed:
                    analysis = parsed.get("analysis", {})
                    detailed = analysis.get("detailedFindings", [])
                    for df in detailed:
                        all_findings.append({
                            "topic": analysis.get("topic", topic),
                            "content": df.get("explanation", ""),
                            "confidence": df.get("confidence", 0.8),
                        })
                    claims = parsed.get("claims", [])
                    for c in claims:
                        all_claims.append(c)
                        await self.claim_ledger.add_claim(
                            text=c.get("text", ""),
                            confidence=round(c.get("confidence", 0.7) * 100),
                            source_agent="deepdiver",
                            evidence=[c.get("evidence", "")],
                        )

        if self.registry.is_active("crossreferencer") and crossref:
            await self._feed("crossreferencer", "Cross-referencing all findings...", PHASE_NAMES[2])
            findings_text = "\n".join([f"- [{f.get('topic', '')}] {f.get('content', '')}" for f in all_findings])
            cross_raw = await crossref.think(f'Findings:\n{findings_text}\n\nFind connections and contradictions.')
            analysis_results["crossReferences"] = crossref.parse_json_response(cross_raw)

        await self._set_phase(2, "complete")

        # ========== Phase 4: Analysis ==========
        await self._set_phase(3, "active")
        findings_text = "\n".join([f"- [{f.get('topic', '')}] {f.get('content', '')}" for f in all_findings])

        async def _run_pattern():
            if self.registry.is_active("pattern") and pattern_agent:
                await self._feed("pattern", "Identifying trends and patterns...", PHASE_NAMES[3])
                raw = await pattern_agent.think(f'Findings:\n{findings_text}\n\nIdentify patterns and trends.')
                analysis_results["patterns"] = pattern_agent.parse_json_response(raw)

        async def _run_quantifier():
            if self.registry.is_active("quantifier") and quant_agent:
                await self._feed("quantifier", "Validating statistics and numbers...", PHASE_NAMES[3])
                raw = await quant_agent.think(f'Findings:\n{findings_text}\n\nValidate numerical claims.')
                analysis_results["quantitative"] = quant_agent.parse_json_response(raw)

        await asyncio.gather(_run_pattern(), _run_quantifier())
        await self._set_phase(3, "complete")

        # ========== Phase 5: Debate ==========
        await self._set_phase(4, "active")
        claims_text = "\n".join([f"- {c.get('text', '')}" for c in all_claims[:5]]) or findings_text[:500]

        if self.registry.is_active("devil") and devil_agent:
            await self._feed("devil", "Challenging assumptions and weak claims...", PHASE_NAMES[4])
            raw = await devil_agent.think(f'Claims to challenge:\n{claims_text}\n\nIdentify weak claims and counter-evidence.')
            parsed = devil_agent.parse_json_response(raw)
            if parsed and "challenges" in parsed:
                debate_results.extend(parsed["challenges"])
                for ch in parsed["challenges"]:
                    await blackboard.post("debateBoard", {
                        "claim": ch.get("targetClaim", ""),
                        "challenger": "devil",
                        "challenge": ch.get("challenge", ""),
                        "severity": ch.get("severity", "medium"),
                    })

        if self.registry.is_active("bias") and bias_agent:
            await self._feed("bias", "Scanning research for bias...", PHASE_NAMES[4])
            raw = await bias_agent.think(f'Findings:\n{findings_text}\n\nCheck for bias and logical fallacies.')
            analysis_results["biases"] = bias_agent.parse_json_response(raw)

        await self._set_phase(4, "complete")

        # ========== Phase 6: Verification ==========
        await self._set_phase(5, "active")
        if self.registry.is_active("factcheck") and factchecker:
            await self._feed("factcheck", "Running final verification and confidence scoring...", PHASE_NAMES[5])
            ledger_claims = await self.claim_ledger.get_sorted()
            claims_input = "\n".join([f"{i+1}. [ID:{c.id}] {c.text} (conf: {c.confidence}%)" for i, c in enumerate(ledger_claims)]) or claims_text
            verify_raw = await factchecker.think(f'Claims to verify:\n{claims_input}\n\nVerify and score confidence.')
            verified = factchecker.parse_json_response(verify_raw)
            if verified and "verifiedClaims" in verified:
                verified_claims = verified["verifiedClaims"]
                await self._feed("factcheck", f"Verified {len(verified_claims)} claims", PHASE_NAMES[5])

        await self._set_phase(5, "complete")

        # ========== Phase 7: Synthesis ==========
        await self._set_phase(6, "active")
        await self._feed("synthesizer", "Compiling authoritative research report...", PHASE_NAMES[6])

        synth_prompt = (
            f'Original Query: "{query}"\n\n'
            f'Findings:\n{findings_text[:1500]}\n\n'
            f'Verified Claims:\n' + "\n".join([f"- [Conf: {vc.get('confidence')}%] {vc.get('claimText')}" for vc in verified_claims]) + "\n\n"
            f'Compile comprehensive Markdown report.'
        )
        report = await synthesizer.think(synth_prompt)
        await self._set_phase(6, "complete")

        # ========== Phase 8: Polish ==========
        await self._set_phase(7, "active")
        if self.registry.is_active("visualizer") and viz_agent:
            await self._feed("visualizer", "Generating summary data tables...", PHASE_NAMES[7])
            viz_raw = await viz_agent.think(f'Findings:\n{findings_text[:1000]}\n\nGenerate structured tables.')
            viz_parsed = viz_agent.parse_json_response(viz_raw)
            if viz_parsed and "tables" in viz_parsed:
                tables_md = "\n\n## Summary Data Tables\n"
                for t in viz_parsed["tables"]:
                    tables_md += f"\n### {t.get('title', 'Table')}\n"
                    headers = t.get("headers", [])
                    tables_md += f"| {' | '.join(headers)} |\n"
                    tables_md += f"| {' | '.join(['---'] * len(headers))} |\n"
                    for row in t.get("rows", []):
                        tables_md += f"| {' | '.join(row)} |\n"
                report += tables_md

        if self.registry.is_active("editor") and editor_agent:
            await self._feed("editor", "Polishing report flow and clarity...", PHASE_NAMES[7])
            polished = await editor_agent.think(f'Polish report:\n\n{report}')
            if polished and len(polished) > len(report) * 0.5:
                report = polished

        await self._set_phase(7, "complete")
        return report

    async def _set_phase(self, index: int, status: str):
        await self._emit_event("phase", {"index": index, "name": PHASE_NAMES[index], "status": status})

    async def _feed(self, agent_id: str, message: str, phase: str):
        await self._emit_event("feed", {"agentId": agent_id, "message": message, "phase": phase, "timestamp": time.time()})
