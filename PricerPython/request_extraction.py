"""Étape 01 du cas #3 : extraire les caractéristiques structurées d'une obligation
depuis une demande de pricing en langage naturel.

Deux extracteurs :
- Mistral (LLM) quand MISTRAL_API_KEY est configuré ;
- un extracteur local déterministe (expressions régulières FR/EN) en repli,
  pour rester résilient quand la clé est absente ou le service indisponible.
"""

from __future__ import annotations

import json
import os
import re
from datetime import date, timedelta
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from database import DatabaseConfigurationError, load_local_environment

MISTRAL_CHAT_COMPLETIONS_URL = "https://api.mistral.ai/v1/chat/completions"
DEFAULT_MISTRAL_MODEL = "mistral-large-4-0"

TARGET_FIELDS = (
    "issuer",
    "isin",
    "sector",
    "rating",
    "seniority",
    "currency",
    "maturity_date",
    "coupon_pct",
    "nominal",
    "frequency",
    "observation_dates",
)

_FIELD_DESCRIPTIONS = (
    "issuer (texte), isin (12 caractères), sector (Sovereign/Corporate/Financials/"
    "Supranational), rating (ex. AAA, BB+), seniority (Senior/Subordinated/Secured), "
    "currency (EUR, USD...), maturity_date (AAAA-MM-JJ), coupon_pct (nombre, ex. 4.5 "
    "pour 4,5 %), nominal (nombre, défaut 100), frequency (1, 2, 4 ou 12), "
    "observation_dates (liste de exactement 2 dates AAAA-MM-JJ, la plus récente en "
    "dernier). Mets null pour tout champ absent de la demande."
)


class ExtractionConfigurationError(RuntimeError):
    """Configuration du service d'extraction absente ou invalide."""


class ExtractionServiceError(RuntimeError):
    """Le service LLM n'a pas fourni un résultat exploitable."""


# ---------------------------------------------------------------------------
# Normalisation commune aux deux extracteurs
# ---------------------------------------------------------------------------


def _parse_date_any(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        pass
    match = re.fullmatch(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", text)
    if not match:
        return None
    first, second, year = (int(part) for part in match.groups())
    if first > 12 and second <= 12:
        day, month = first, second
    elif second > 12 and first <= 12:
        month, day = first, second
    else:
        day, month = first, second  # convention FR jj/mm/aaaa
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _normalize_extracted(parsed: Any) -> tuple[dict[str, Any], list[str]]:
    """Valider/coercir le JSON extrait et lister les champs manquants."""
    if not isinstance(parsed, dict):
        raise ExtractionServiceError("L'extraction n'est pas un objet JSON.")
    target: dict[str, Any] = {}

    for key in ("issuer", "isin", "sector", "rating", "seniority"):
        value = parsed.get(key)
        target[key] = str(value).strip() if value else None

    currency = parsed.get("currency")
    target["currency"] = str(currency).strip().upper() if currency else None

    isin = target.get("isin")
    if isin and not re.fullmatch(r"[A-Z]{2}[A-Z0-9]{9}\d", isin.upper()):
        target["isin"] = None

    target["maturity_date"] = _parse_date_any(parsed.get("maturity_date"))

    coupon_pct = parsed.get("coupon_pct")
    if coupon_pct is None and parsed.get("coupon") is not None:
        coupon_decimal = parsed.get("coupon")
        try:
            coupon_pct = float(coupon_decimal) * 100 if float(coupon_decimal) <= 1 else float(coupon_decimal)
        except (TypeError, ValueError):
            coupon_pct = None
    try:
        target["coupon_pct"] = round(float(coupon_pct), 6) if coupon_pct is not None else None
    except (TypeError, ValueError):
        target["coupon_pct"] = None

    try:
        nominal = float(parsed.get("nominal") or 100)
        target["nominal"] = nominal if nominal > 0 else 100.0
    except (TypeError, ValueError):
        target["nominal"] = 100.0

    try:
        frequency = int(parsed.get("frequency") or 2)
    except (TypeError, ValueError):
        frequency = 2
    target["frequency"] = frequency if frequency in (1, 2, 4, 12) else 2

    raw_dates = parsed.get("observation_dates")
    observation_dates: list[date] = []
    if isinstance(raw_dates, (list, tuple)):
        for item in raw_dates:
            parsed_date = _parse_date_any(item)
            if parsed_date is not None:
                observation_dates.append(parsed_date)
    target["observation_dates"] = (
        sorted(observation_dates) if len(observation_dates) == 2 else None
    )

    missing = [field for field in TARGET_FIELDS if not target.get(field)]
    return target, missing


# ---------------------------------------------------------------------------
# Extracteur LLM (Mistral)
# ---------------------------------------------------------------------------


def extract_target_with_mistral(
    request_text: str,
    *,
    api_key: str | None = None,
    model: str | None = None,
    timeout: float = 30,
) -> dict[str, Any]:
    """Extraire la cible via Mistral ; lève si la clé manque ou le service échoue."""
    try:
        load_local_environment()
    except DatabaseConfigurationError as exc:
        raise ExtractionConfigurationError(str(exc)) from exc
    key = api_key or os.environ.get("MISTRAL_API_KEY", "").strip()
    if not key:
        raise ExtractionConfigurationError(
            "MISTRAL_API_KEY est absent ; configurez-le dans l'environnement."
        )
    selected_model = (
        model or os.environ.get("MISTRAL_MODEL", DEFAULT_MISTRAL_MODEL)
    ).strip()
    if not selected_model:
        raise ExtractionConfigurationError("MISTRAL_MODEL ne peut pas être vide.")

    request_body = {
        "model": selected_model,
        "temperature": 0,
        "max_tokens": 600,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "Tu es l'agent d'analyse de demande d'un pricer obligataire "
                    "(cas d'usage #3). À partir d'une demande de pricing en langage "
                    "naturel (français ou anglais), extrais les caractéristiques de "
                    "l'obligation à pricer. Ne réponds qu'en JSON, sans texte autour, "
                    "avec uniquement ces champs : " + _FIELD_DESCRIPTIONS
                ),
            },
            {"role": "user", "content": request_text},
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
        raise ExtractionServiceError(
            f"Mistral a répondu avec HTTP {exc.code}."
        ) from exc
    except URLError as exc:
        raise ExtractionServiceError(
            f"Connexion au service Mistral impossible : {exc.reason}"
        ) from exc
    except (TimeoutError, json.JSONDecodeError) as exc:
        raise ExtractionServiceError(
            "La réponse du service Mistral est expirée ou invalide."
        ) from exc

    try:
        content = response_data["choices"][0]["message"]["content"]
        content = re.sub(r"^```(?:json)?|```$", "", str(content).strip(), flags=re.MULTILINE).strip()
        parsed = json.loads(content)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise ExtractionServiceError(
            "Mistral n'a pas renvoyé l'extraction JSON attendue."
        ) from exc

    target, missing = _normalize_extracted(parsed)
    return {
        "extractor": "mistral",
        "model": response_data.get("model", selected_model),
        "target": _serialize_target(target),
        "missing_fields": missing,
    }


def _serialize_target(target: dict[str, Any]) -> dict[str, Any]:
    serialized = dict(target)
    if serialized.get("maturity_date") is not None:
        serialized["maturity_date"] = serialized["maturity_date"].isoformat()
    if serialized.get("observation_dates") is not None:
        serialized["observation_dates"] = [
            d.isoformat() for d in serialized["observation_dates"]
        ]
    return serialized


# ---------------------------------------------------------------------------
# Extracteur local (repli déterministe, FR/EN)
# ---------------------------------------------------------------------------

_ISIN_RE = re.compile(r"\b([A-Z]{2}[A-Z0-9]{9}\d)\b")
_RATING_RE = re.compile(
    r"\b(AAA|AA[+-]?|A[+-]?|BBB[+-]?|BB[+-]?|B[+-]?|CCC[+-]?|CC|C|D)(?![A-Za-z0-9])"
)
_CURRENCY_RE = re.compile(r"\b(EUR|USD|GBP|CHF|JPY)\b", re.IGNORECASE)
_DATE_RE = re.compile(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b")
_MATURITY_CONTEXT_RE = re.compile(
    r"(?:échéance|maturit[ée]|maturity|matures?|due)\s*(?:au|le|en|on|:)?\s*"
    r"(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{2}-\d{2}|\d{4})",
    re.IGNORECASE,
)
_RELATIVE_YEARS_RE = re.compile(
    r"(?:dans|in|over)\s+(\d{1,2})\s*(?:ans|an|years?|y)\b", re.IGNORECASE
)
_YEAR_ONLY_RE = re.compile(
    r"(?:échéance|maturit[ée]|maturity)\s*(?:en|in|:)?\s*(20\d{2})\b", re.IGNORECASE
)
_COUPON_RES = (
    re.compile(r"coupon\s+(?:de\s+|fixe\s+de\s+|annual\s+)?(\d+(?:[.,]\d+)?)\s*%", re.IGNORECASE),
    re.compile(r"(\d+(?:[.,]\d+)?)\s*%[^.;,\n]{0,20}?coupon", re.IGNORECASE),
    re.compile(r"taux\s+(?:de\s+|fixe\s+de\s+)?(\d+(?:[.,]\d+)?)\s*%", re.IGNORECASE),
)
_FREQUENCY_RES = (
    (re.compile(r"semi[-\s]?(?:annuel|annuelle|annual|annually|estriel|estrielle)", re.IGNORECASE), 2),
    (re.compile(r"trimestriel|quarterly", re.IGNORECASE), 4),
    (re.compile(r"mensuel|monthly", re.IGNORECASE), 12),
    (re.compile(r"annuel|annuelle|annual|annually", re.IGNORECASE), 1),
)
_SECTOR_RES = (
    (re.compile(r"souverain|état|etat|gouvernement|government|sovereign|bund|treasury", re.IGNORECASE), "Sovereign"),
    (re.compile(r"supranational|agence|agency", re.IGNORECASE), "Supranational"),
    (re.compile(r"financier|financial|banque|bank|assurance|insurance", re.IGNORECASE), "Financials"),
    (re.compile(r"corporate|entreprise|industriel|industrial", re.IGNORECASE), "Corporate"),
)
_SENIORITY_RES = (
    (re.compile(r"subordonn|subordinated|junior", re.IGNORECASE), "Subordinated"),
    (re.compile(r"garanti|secured|nantissement", re.IGNORECASE), "Secured"),
    (re.compile(r"senior|privilégi|preferred", re.IGNORECASE), "Senior"),
)
_ISSUER_RES = (
    re.compile(r"(?:émis(?:e|es)?|issued)\s+par\s+([^,.;>\n]+)", re.IGNORECASE),
    re.compile(r"(?:émetteur|issuer)\s+(?:[:\-]\s*)?([^,.;>\n]+)", re.IGNORECASE),
    re.compile(r"issued\s+by\s+([^,.;>\n]+)", re.IGNORECASE),
    re.compile(r"obligation\s+de\s+([^,.;>\n]+)", re.IGNORECASE),
    re.compile(r"bond\s+(?:of|from|by)\s+([^,.;>\n]+)", re.IGNORECASE),
)
_NOMINAL_RE = re.compile(
    r"(?:nominal|face\s*value|montant)\s+(?:de\s+)?(\d+(?:[.,]\d+)?)", re.IGNORECASE
)


def _first_date_match(text: str) -> date | None:
    for match in _DATE_RE.finditer(text):
        if match.group(1):
            first, second, year = int(match.group(1)), int(match.group(2)), int(match.group(3))
            if first > 12 and second <= 12:
                day, month = first, second
            elif second > 12 and first <= 12:
                month, day = first, second
            else:
                day, month = first, second
        else:
            year, month, day = int(match.group(4)), int(match.group(5)), int(match.group(6))
        try:
            return date(year, month, day)
        except ValueError:
            continue
    return None


def _all_dates(text: str) -> list[date]:
    found: list[date] = []
    for match in _DATE_RE.finditer(text):
        parsed = _parse_date_any(match.group(0))
        if parsed is not None and parsed not in found:
            found.append(parsed)
    return found


def extract_target_local(request_text: str) -> dict[str, Any]:
    """Extraction déterministe FR/EN par expressions régulières."""
    text = request_text
    parsed: dict[str, Any] = {}

    isin_match = _ISIN_RE.search(text)
    if isin_match:
        parsed["isin"] = isin_match.group(1).upper()

    rating_match = _RATING_RE.search(text)
    if rating_match:
        parsed["rating"] = rating_match.group(1).upper()

    currency_match = _CURRENCY_RE.search(text)
    if currency_match:
        parsed["currency"] = currency_match.group(1).upper()

    for pattern, sector in _SECTOR_RES:
        if pattern.search(text):
            parsed["sector"] = sector
            break

    for pattern, seniority in _SENIORITY_RES:
        if pattern.search(text):
            parsed["seniority"] = seniority
            break

    for pattern in _ISSUER_RES:
        match = pattern.search(text)
        if match:
            parsed["issuer"] = match.group(1).strip().rstrip(" ,;:")
            break

    for pattern in _COUPON_RES:
        match = pattern.search(text)
        if match:
            parsed["coupon_pct"] = float(match.group(1).replace(",", "."))
            break

    for pattern, frequency in _FREQUENCY_RES:
        if pattern.search(text):
            parsed["frequency"] = frequency
            break

    nominal_match = _NOMINAL_RE.search(text)
    if nominal_match:
        parsed["nominal"] = float(nominal_match.group(1).replace(",", "."))

    maturity: date | None = None
    maturity_match = _MATURITY_CONTEXT_RE.search(text)
    if maturity_match:
        maturity = _parse_date_any(maturity_match.group(1))
        if maturity is None:  # année seule, ex. « maturité 2031 »
            year_match = re.fullmatch(r"(20\d{2})", maturity_match.group(1))
            if year_match:
                maturity = date(int(year_match.group(1)), 12, 31)
    if maturity is None:
        relative = _RELATIVE_YEARS_RE.search(text)
        if relative:
            maturity = date.today() + timedelta(days=365 * int(relative.group(1)))
    if maturity is None:
        year_only = _YEAR_ONLY_RE.search(text)
        if year_only:
            maturity = date(int(year_only.group(1)), 12, 31)
    parsed["maturity_date"] = maturity

    all_dates = _all_dates(text)
    remaining = [d for d in all_dates if d != maturity]
    if len(remaining) >= 2:
        parsed["observation_dates"] = sorted(remaining)[:2]
    elif len(remaining) == 1 and maturity is None:
        parsed["maturity_date"] = remaining[0]

    target, missing = _normalize_extracted(parsed)
    return {
        "extractor": "local",
        "target": _serialize_target(target),
        "missing_fields": missing,
    }


# ---------------------------------------------------------------------------
# Point d'entrée : LLM si possible, repli local sinon (résilience)
# ---------------------------------------------------------------------------


def extract_target(
    request_text: str,
    *,
    api_key: str | None = None,
    model: str | None = None,
    timeout: float = 30,
    prefer_llm: bool = True,
) -> dict[str, Any]:
    """Extraire la cible d'une demande en langage naturel.

    Essaie Mistral quand une clé est disponible, puis retombe sur
    l'extracteur local en cas d'indisponibilité (résilience).
    """
    if not str(request_text or "").strip():
        raise ValueError("La demande de pricing ne peut pas être vide.")
    if not prefer_llm:
        return extract_target_local(request_text)
    try:
        return extract_target_with_mistral(
            request_text, api_key=api_key, model=model, timeout=timeout
        )
    except ExtractionConfigurationError:
        return extract_target_local(request_text)
    except ExtractionServiceError as exc:
        result = extract_target_local(request_text)
        result["fallback_reason"] = str(exc)
        return result
