"""Revue contradictoire du panel ; le LLM ne calcule ni ne modifie les prix."""

from __future__ import annotations

import json
import os
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from database import DatabaseConfigurationError, load_local_environment

MISTRAL_CHAT_COMPLETIONS_URL = "https://api.mistral.ai/v1/chat/completions"
DEFAULT_MISTRAL_MODEL = "mistral-large-4-0"


class JudgeConfigurationError(RuntimeError):
    """Configuration du service de revue IA absente ou invalide."""


class JudgeServiceError(RuntimeError):
    """Le service de revue IA n'a pas fourni un résultat exploitable."""


def _review_payload(panel_report: dict[str, Any]) -> dict[str, Any]:
    selected = []
    for candidate in panel_report.get("selected", []):
        selected.append(
            {
                "isin": candidate.get("isin"),
                "issuer": candidate.get("issuer"),
                "currency": candidate.get("currency"),
                "maturity_date": candidate.get("maturity_date"),
                "rating": candidate.get("rating"),
                "seniority": candidate.get("seniority"),
                "spread_bps": candidate.get("spread_bps"),
                "z_spread_bps": candidate.get("z_spread_bps"),
                "coupon_rate_pct": candidate.get("coupon_rate_pct"),
                "esg_score": candidate.get("esg_score"),
                "source": candidate.get("source_name"),
                "data_status": candidate.get("data_status"),
                "market_date": candidate.get("market_date"),
                "similarity_score": candidate.get("similarity_score"),
                "matches": candidate.get("matches"),
                "differences": candidate.get("differences"),
            }
        )
    return {
        "target": panel_report.get("target"),
        "selected": selected,
        "zero_curve": panel_report.get("zero_curve"),
        "excluded_count": len(panel_report.get("excluded", [])),
        "methodology": panel_report.get("methodology"),
        "quality_flags": panel_report.get("quality_flags"),
        "valuation_allowed": panel_report.get("valuation_allowed"),
        "valuation_result": panel_report.get("valuation_result"),
    }


def _validate_review(result: Any) -> dict[str, Any]:
    if not isinstance(result, dict):
        raise JudgeServiceError("La revue IA n'est pas un objet JSON.")
    verdict = result.get("verdict")
    if verdict not in {"challenge", "conditional", "no_critical_issue"}:
        raise JudgeServiceError("La revue IA contient un verdict non reconnu.")
    fields = ("critical_findings", "other_findings", "challenge_questions")
    for field in fields:
        value = result.get(field)
        if not isinstance(value, list) or not all(
            isinstance(item, str) for item in value
        ):
            raise JudgeServiceError(
                f"La revue IA ne contient pas une liste de textes valide ({field})."
            )
    summary = result.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        raise JudgeServiceError("La revue IA ne contient pas de synthèse.")
    return {
        "verdict": verdict,
        "critical_findings": result["critical_findings"],
        "other_findings": result["other_findings"],
        "challenge_questions": result["challenge_questions"],
        "summary": summary,
        "model": result.get("model", ""),
    }


def challenge_panel(
    panel_report: dict[str, Any],
    *,
    api_key: str | None = None,
    model: str | None = None,
    timeout: float = 30,
) -> dict[str, Any]:
    """Demande au modèle une critique structurée, limitée aux faits fournis."""
    try:
        load_local_environment()
    except DatabaseConfigurationError as exc:
        raise JudgeConfigurationError(str(exc)) from exc
    key = api_key or os.environ.get("MISTRAL_API_KEY", "").strip()
    if not key:
        raise JudgeConfigurationError(
            "MISTRAL_API_KEY est absent ; configurez-le dans l'environnement."
        )
    selected_model = (
        model or os.environ.get("MISTRAL_MODEL", DEFAULT_MISTRAL_MODEL)
    ).strip()
    if not selected_model:
        raise JudgeConfigurationError("MISTRAL_MODEL ne peut pas être vide.")

    evidence = json.dumps(_review_payload(panel_report), ensure_ascii=False, default=str)
    request_body = {
        "model": selected_model,
        "temperature": 0,
        "max_tokens": 900,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "Tu es l'agent juge indépendant d'un pricer obligataire. "
                    "Tu ne recalcules jamais le prix et ne peux pas modifier le résultat. "
                    "Ne complète pas les données absentes et n'invente aucune source. "
                    "Challenge la qualité du panel, la date, la devise, les écarts "
                    "de caractéristiques, la provenance et les limites méthodologiques. "
                    "Challenge également les hypothèses, les contrôles et les résultats "
                    "d'une valorisation fournie, sans recalculer ni modifier les chiffres. "
                    "La synthèse doit préciser que des données synthétiques, non datées "
                    "ou saisies par l'utilisateur ne prouvent pas une valeur de marché. "
                    "Ne révèle pas de raisonnement "
                    "interne détaillé ; donne seulement les constats et questions vérifiables. "
                    "Réponds uniquement en JSON avec verdict (challenge, conditional ou "
                    "no_critical_issue), critical_findings (liste de textes), "
                    "other_findings (liste), challenge_questions (liste) et summary (texte)."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Vérifie contradictoirement ce rapport de sélection et de valorisation. "
                    "Utilise uniquement les éléments de preuve ci-dessous :\n"
                    f"{evidence}"
                ),
            },
        ],
    }
    request = Request(
        MISTRAL_CHAT_COMPLETIONS_URL,
        data=json.dumps(request_body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            response_data = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise JudgeServiceError(
            f"Mistral a répondu avec HTTP {exc.code}."
        ) from exc
    except URLError as exc:
        raise JudgeServiceError(
            f"Connexion au service Mistral impossible : {exc.reason}"
        ) from exc
    except (TimeoutError, json.JSONDecodeError) as exc:
        raise JudgeServiceError(
            "La réponse du service Mistral est expirée ou invalide."
        ) from exc

    try:
        content = response_data["choices"][0]["message"]["content"]
        parsed = json.loads(content)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise JudgeServiceError(
            "Mistral n'a pas renvoyé la revue JSON attendue."
        ) from exc
    validated = _validate_review(parsed)
    validated["model"] = response_data.get("model", selected_model)
    return validated


def challenge_valuation_report(
    valuation_report: dict[str, Any],
    *,
    api_key: str | None = None,
    model: str | None = None,
    timeout: float = 30,
) -> dict[str, Any]:
    """Construit les faits nécessaires pour challenger un rapport de pricing."""
    request = valuation_report["request"]
    selected = []
    excluded = []
    for comparable in request["comparables"]:
        evidence = {
            "isin": comparable["name"],
            "z_spread_bps": comparable["z_spread_bps"],
            "similarity_score": comparable["similarity"],
            "source_name": comparable["source"],
            "market_date": request["observation_date"],
            "data_status": "user_entered_unverified",
            "matches": [],
            "differences": [],
        }
        if comparable["included"]:
            selected.append(evidence)
        else:
            excluded.append(
                {"isin": comparable["name"], "reason": comparable["reason"]}
            )
    evidence = {
        "target": {
            key: request.get(key)
            for key in (
                "issuer",
                "isin",
                "sector",
                "rating",
                "seniority",
                "currency",
                "observation_date",
                "settlement_date",
                "maturity_date",
                "coupon",
                "frequency",
                "curve_source",
            )
        },
        "selected": selected,
        "excluded": excluded,
        "methodology": valuation_report.get("methodology"),
        "zero_curve": request.get("curve", []),
        "quality_flags": [
            *valuation_report.get("warnings", []),
            "Les comparables et la courbe ont été saisis par l'utilisateur ; leur provenance n'a pas été vérifiée.",
        ],
        "valuation_allowed": False,
        "valuation_result": valuation_report.get("result"),
    }
    return challenge_panel(
        evidence,
        api_key=api_key,
        model=model,
        timeout=timeout,
    )
