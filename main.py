"""
NexusResearch Main Entry Point
Start the FastAPI server via Uvicorn or run a CLI research query.
"""

import sys
import argparse
import asyncio
import uvicorn

from nexus.config import settings


def run_server():
    uvicorn.run(
        "nexus.web.app:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )


def cli():
    parser = argparse.ArgumentParser(description="NexusResearch Multi-Agent Platform")
    parser.add_argument("--server", action="store_true", help="Start FastAPI Web Server")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind server")
    parser.add_argument("--query", type=str, help="Run CLI research query directly")
    parser.add_argument("--depth", type=str, default="standard", help="Research depth (quick|standard|deep|exhaustive)")
    args = parser.parse_args()

    if args.query:
        from nexus.agents.registry import AgentRegistry
        from nexus.core.pipeline import Pipeline

        async def _run_cli():
            reg = AgentRegistry()
            pipe = Pipeline(reg)
            print(f"Starting research on: '{args.query}' [Depth: {args.depth}]...")
            report = await pipe.start(args.query, args.depth)
            print("\n" + "=" * 60)
            print("FINAL RESEARCH REPORT")
            print("=" * 60 + "\n")
            print(report)

        asyncio.run(_run_cli())
    else:
        settings.port = args.port
        print(f"Starting NexusResearch server on http://localhost:{settings.port}...")
        run_server()


if __name__ == "__main__":
    cli()
