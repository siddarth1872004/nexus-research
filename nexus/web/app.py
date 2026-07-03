"""
FastAPI Server for NexusResearch
Provides REST API endpoints and WebSocket connection for real-time swarm updates.
Serves static AMOLED Black & White Web UI.
"""

import os
import asyncio
import logging
from typing import Dict, Any, List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from nexus.config import settings
from nexus.api.gemini_client import gemini_client
from nexus.agents.registry import AgentRegistry
from nexus.core.pipeline import Pipeline
from nexus.web.websocket import manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("nexus.web")

app = FastAPI(
    title="NexusResearch",
    description="Multi-Agent Swarm Intelligence Platform powered by FastAPI and Google Gemini API",
    version="2.0.0",
)

registry = AgentRegistry()
pipeline = Pipeline(registry)

# History storage in-memory with file backup
research_history: List[Dict[str, Any]] = []

# Event callback connecting pipeline to WebSockets
async def pipeline_event_handler(event_type: str, data: dict):
    await manager.broadcast(event_type, data)

pipeline.set_event_callback(pipeline_event_handler)


class ResearchRequest(BaseModel):
    query: str
    depth: str = "standard"


class SettingsRequest(BaseModel):
    gemini_api_key: Optional[str] = None
    depth: Optional[str] = "standard"


@app.post("/api/settings")
async def update_settings(req: SettingsRequest):
    if req.gemini_api_key is not None:
        settings.gemini_api_key = req.gemini_api_key
        gemini_client.set_api_key(req.gemini_api_key)
        valid = await gemini_client.validate_api_key()
        return {"status": "ok", "validKey": valid}
    return {"status": "ok"}


@app.get("/api/settings")
async def get_settings():
    has_key = bool(settings.gemini_api_key)
    return {
        "hasKey": has_key,
        "model": settings.gemini_model,
        "defaultDepth": "standard",
    }


@app.post("/api/validate-key")
async def validate_key(req: SettingsRequest):
    key = req.gemini_api_key or settings.gemini_api_key
    valid = await gemini_client.validate_api_key(key)
    if valid and req.gemini_api_key:
        settings.gemini_api_key = req.gemini_api_key
        gemini_client.set_api_key(req.gemini_api_key)
    return {"valid": valid}


@app.post("/api/research")
async def start_research(req: ResearchRequest, background_tasks: BackgroundTasks):
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    if not settings.gemini_api_key:
        raise HTTPException(status_code=401, detail="API Key required")

    # Run pipeline as async background task
    async def run_pipeline():
        try:
            report = await pipeline.start(req.query, req.depth)
            history_item = {
                "id": str(len(research_history) + 1),
                "query": req.query,
                "depth": req.depth,
                "report": report,
            }
            research_history.insert(0, history_item)
            if len(research_history) > settings.max_history_entries:
                research_history.pop()
        except Exception as e:
            logger.error(f"Background research pipeline error: {e}")

    background_tasks.add_task(run_pipeline)
    return {"status": "started", "query": req.query, "depth": req.depth}


@app.get("/api/history")
async def get_history():
    return {"history": research_history}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# Serve Static Assets for AMOLED Web UI
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
async def get_index():
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return JSONResponse({"message": "NexusResearch FastAPI Server Running"})
