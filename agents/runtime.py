"""Model + agent construction (PRD 30).

Every agent is built here so the model id, region and the stub switch live in
one place. FIELDPROOF_STUB_AGENTS=1 skips Bedrock entirely and lets the
deterministic extractors in agents/evidence/extractors.py stand in, which is
what makes the test suite and offline demos possible.
"""

from __future__ import annotations

from typing import Any

from infra.settings import get_settings


def stub_mode() -> bool:
    return get_settings().stub_agents


def build_model() -> Any:
    """Bedrock model shared by every agent."""
    from strands.models import BedrockModel

    settings = get_settings()
    return BedrockModel(model_id=settings.bedrock_model_id, region_name=settings.bedrock_region)


def build_agent(name: str, system_prompt: str, tools: list[Any] | None = None) -> Any:
    """Construct one Strands agent. Raises in stub mode - callers should check."""
    from strands import Agent

    return Agent(
        name=name,
        model=build_model(),
        system_prompt=system_prompt,
        tools=tools or [],
        callback_handler=None,
    )
