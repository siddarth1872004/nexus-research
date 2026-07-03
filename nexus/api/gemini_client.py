"""
Async Google Gemini API Client
Handles SSE streaming, non-streaming generation, exponential backoff retries,
and key validation.
"""

import asyncio
import json
import logging
from typing import AsyncGenerator, List, Dict, Any, Optional
import aiohttp

from nexus.config import settings

logger = logging.getLogger("nexus.api")
API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(f"Gemini API Error {status}: {message}")
        self.status = status
        self.message = message


class GeminiClient:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.gemini_api_key

    def set_api_key(self, api_key: str):
        self.api_key = api_key

    async def validate_api_key(self, api_key: Optional[str] = None) -> bool:
        key = api_key or self.api_key
        if not key:
            return False
        url = f"{API_BASE}/{settings.gemini_model}:generateContent?key={key}"
        payload = {
            "contents": [{"parts": [{"text": "Hi"}]}],
            "generationConfig": {"maxOutputTokens": 5},
        }
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, timeout=5) as resp:
                    return resp.status == 200
        except Exception as e:
            logger.warning(f"API key validation failed: {e}")
            return False

    async def generate(
        self,
        system_prompt: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_retries: int = 3,
    ) -> str:
        if not self.api_key:
            raise ApiError(401, "API Key is missing. Please configure your Gemini API Key.")

        url = f"{API_BASE}/{settings.gemini_model}:generateContent?key={self.api_key}"
        payload = self._build_payload(system_prompt, messages, temperature)

        for attempt in range(max_retries):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(url, json=payload, timeout=60) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            text = (
                                data.get("candidates", [{}])[0]
                                .get("content", {})
                                .get("parts", [{}])[0]
                                .get("text", "")
                            )
                            return text

                        err_text = await resp.text()
                        if resp.status == 429:
                            backoff = min(1.0 * (2**attempt), 16.0)
                            logger.warning(f"Rate limited (429), backing off {backoff}s...")
                            await asyncio.sleep(backoff)
                            continue

                        raise ApiError(resp.status, err_text[:200])

            except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                if attempt == max_retries - 1:
                    raise ApiError(500, f"Network error: {str(e)}")
                await asyncio.sleep(1.0 * (attempt + 1))

        raise ApiError(500, "Max retries exceeded")

    async def stream_generate(
        self,
        system_prompt: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        if not self.api_key:
            raise ApiError(401, "API Key is missing. Please configure your Gemini API Key.")

        url = f"{API_BASE}/{settings.gemini_model}:streamGenerateContent?alt=sse&key={self.api_key}"
        payload = self._build_payload(system_prompt, messages, temperature)

        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, timeout=60) as resp:
                if resp.status != 200:
                    err_text = await resp.text()
                    raise ApiError(resp.status, err_text[:200])

                async for line in resp.content:
                    line_str = line.decode("utf-8").strip()
                    if line_str.startswith("data: "):
                        json_str = line_str[6:].strip()
                        if not json_str or json_str == "[DONE]":
                            continue
                        try:
                            data = json.loads(json_str)
                            chunk = (
                                data.get("candidates", [{}])[0]
                                .get("content", {})
                                .get("parts", [{}])[0]
                                .get("text", "")
                            )
                            if chunk:
                                yield chunk
                        except json.JSONDecodeError:
                            continue

    def _build_payload(
        self, system_prompt: str, messages: List[Dict[str, str]], temperature: float
    ) -> Dict[str, Any]:
        contents = []
        for m in messages:
            role = "model" if m.get("role") == "model" else "user"
            contents.append({"role": role, "parts": [{"text": m.get("text", "")}]})

        return {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "topP": 0.9,
                "maxOutputTokens": 4096,
            },
        }


gemini_client = GeminiClient()
