"""Optional Mistral explanation adapter; it cannot query data or alter calculations."""

from __future__ import annotations

import json
import os
from typing import Any


SYSTEM_PROMPT = (
    "You explain a deterministic bond-pricing result to a user. Treat the supplied JSON as the only "
    "source of facts. Do not invent quotes, ratings, comparables, curves, sources, or values; do not "
    "recalculate or change results. State missing inputs and warnings plainly. A highest yield is not "
    "a risk-adjusted recommendation. This is not investment advice."
)


def explain(question: str, pricing_result: dict[str, Any]) -> str:
    api_key = os.getenv("MISTRAL_API_KEY")
    if not api_key:
        raise RuntimeError("MISTRAL_API_KEY is not configured; deterministic pricing remains available")
    try:
        from mistralai import Mistral
    except ImportError as exc:
        raise RuntimeError("Install the optional Mistral SDK: pip install '.[mistral]'") from exc

    client = Mistral(api_key=api_key)
    response = client.chat.complete(
        model=os.getenv("MISTRAL_MODEL", "mistral-small-latest"),
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Question: {question[:4000]}\n\n"
                    f"Deterministic pricing result:\n{json.dumps(pricing_result, ensure_ascii=False)[:16000]}"
                ),
            },
        ],
    )
    content = response.choices[0].message.content
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("Mistral returned no usable explanation")
    return content
