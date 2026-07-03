"""
NexusResearch Configuration Settings
"""

import os
from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "NexusResearch"
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8000

    # Gemini API
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    gemini_model: str = "gemini-2.0-flash"
    max_concurrency: int = 3
    tokens_per_minute: int = 15

    # Storage & History
    max_history_entries: int = 20

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
