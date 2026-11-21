"""Sélection déterministe et explicable d'obligations comparables."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any


_RATING_ORDER = (
    "AAA",
    "AA+",
    "AA",
    "AA-",
    "A+",
    "A",
    "A-",
    "BBB+",
    "BBB",
    "BBB-",
    "BB+",
    "BB",
    "BB-",
    "B+",
    "B",
    "B-",
    "CCC+",
    "CCC",
    "CCC-",
    "CC",
    "C",
    "D",
)
_MOODYS_RATINGS = {
    "AAA": "AAA",
    "AA1": "AA+",
    "AA2": "AA",
    "AA3": "AA-",
    "A1": "A+",
    "A2": "A",
    "A3": "A-",
    "BAA1": "BBB+",
    "BAA2": "BBB",
    "BAA3": "BBB-",
    "BA1": "BB+",
    "BA2": "BB",
    "BA3": "BB-",
    "B1": "B+",
    "B2": "B",
    "B3": "B-",
    "CAA1": "CCC+",
    "CAA2": "CCC",
    "CAA3": "CCC-",
    "CA": "CC",
    "C": "C",
}
_WEIGHTS = {
    "maturity": 20,
    "rating": 25,
    "sector": 15,
    "seniority": 15,
    "coupon type": 10,
    "coupon rate": 15,
}
_WEIGHT_LABELS = {
    "maturity": "maturité",
    "rating": "notation",
    "sector": "secteur / type d'émetteur",
    "seniority": "séniorité",
    "coupon type": "type de coupon",
    "coupon rate": "taux de coupon",
}
_UNSUPPORTED_STRUCTURE_FLAGS = (
    "is_callable",
    "is_putable",
    "is_convertible",
    "is_perpetual",
    "is_inflation_linked",
)


@dataclass(frozen=True)
class TargetBond:
    isin: str
    issuer: str
    sector: str
    rating: str
    seniority: str
    currency: str
    maturity_date: date
    observation_date: date
    coupon_type: str = "Fixed"
    bond_type: str = "Fixed"
    coupon_rate_pct: float | None = None


def _normalized(value: Any) -> str:
    return str(value or "").strip().casefold()


def _flag_is_enabled(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    normalized = str(value).strip().casefold()
    if normalized in {"", "false", "no", "non", "n", "0", "off"}:
        return False
    if normalized in {"true", "yes", "oui", "y", "1", "on"}:
        return True
    return True


def _rating_notch(value: Any) -> int | None:
    rating = str(value or "").strip().upper().replace(" ", "")
    normalized = _MOODYS_RATINGS.get(rating, rating)
    try:
        return _RATING_ORDER.index(normalized)
    except ValueError:
        return None


def _maturity_score(target: date, candidate: Any) -> tuple[float, float] | None:
    if not isinstance(candidate, date):
        return None
    gap_years = abs((candidate - target).days) / 365.25
    return max(0.0, 100.0 - 20.0 * gap_years), gap_years


def _candidate_score(
    target: TargetBond, candidate: dict[str, Any]
) -> tuple[float, list[str], list[str]]:
    scores: dict[str, float] = {}
    matches: list[str] = []
    differences: list[str] = []

    maturity = _maturity_score(target.maturity_date, candidate.get("maturity_date"))
    if maturity is None:
        scores["maturity"] = 0.0
        differences.append("maturité du comparable absente")
    else:
        maturity_points, gap_years = maturity
        scores["maturity"] = maturity_points
        if gap_years < 0.01:
            matches.append("maturité identique")
        else:
            differences.append(f"écart de maturité {gap_years:.2f} an(s)")

    target_rating = _rating_notch(target.rating)
    candidate_rating = _rating_notch(candidate.get("rating"))
    if target_rating is None or candidate_rating is None:
        scores["rating"] = 0.0
        differences.append("notation manquante ou non comparable")
    else:
        notch_gap = abs(target_rating - candidate_rating)
        scores["rating"] = max(0.0, 100.0 - notch_gap * 25.0)
        if notch_gap == 0:
            matches.append("notation équivalente")
        else:
            differences.append(f"écart de notation {notch_gap} cran(s)")

    for criterion, target_value, candidate_value in (
        ("sector", target.sector, candidate.get("issuer_type")),
        ("seniority", target.seniority, candidate.get("seniority")),
        ("coupon type", target.coupon_type, candidate.get("coupon_type")),
    ):
        if _normalized(target_value) and _normalized(candidate_value):
            equal = _normalized(target_value) == _normalized(candidate_value)
            scores[criterion] = 100.0 if equal else 0.0
            if equal:
                matches.append(f"{criterion} identique")
            else:
                differences.append(f"{criterion} différent")
        else:
            scores[criterion] = 0.0
            differences.append(f"{criterion} manquant")

    candidate_coupon = candidate.get("coupon_rate_pct")
    if target.coupon_rate_pct is None or candidate_coupon is None:
        scores["coupon rate"] = 0.0
        differences.append("coupon manquant")
    else:
        coupon_gap = abs(float(candidate_coupon) - target.coupon_rate_pct)
        scores["coupon rate"] = max(0.0, 100.0 - 20.0 * coupon_gap)
        if coupon_gap < 0.01:
            matches.append("coupon identique")
        else:
            differences.append(f"écart de coupon {coupon_gap:.2f} point(s)")

    score = sum(
        _WEIGHTS[criterion] * scores[criterion] / 100
        for criterion in _WEIGHTS
    )
    return score, matches, differences


def select_comparables(
    target: TargetBond,
    candidates: list[dict[str, Any]],
    *,
    limit: int = 5,
) -> dict[str, Any]:
    """Classe les titres admissibles et retourne une justification par titre."""
    if not 1 <= limit <= 20:
        raise ValueError("Le nombre de comparables doit être compris entre 1 et 20.")

    selected_candidates = []
    excluded = []
    for candidate in candidates:
        isin = str(candidate.get("isin") or "").strip()
        if target.isin and isin.casefold() == target.isin.strip().casefold():
            excluded.append({"isin": isin, "reason": "titre cible exclu du panel"})
            continue
        if _normalized(candidate.get("currency")) != _normalized(target.currency):
            excluded.append({"isin": isin, "reason": "devise différente"})
            continue
        if any(
            _flag_is_enabled(candidate.get(flag))
            for flag in _UNSUPPORTED_STRUCTURE_FLAGS
        ):
            excluded.append(
                {
                    "isin": isin,
                    "reason": "optionnalité ou structure non prise en charge",
                }
            )
            continue
        if isinstance(candidate.get("maturity_date"), date) and (
            candidate["maturity_date"] <= target.observation_date
        ):
            excluded.append({"isin": isin, "reason": "échéance invalide"})
            continue
        if (
            _normalized(candidate.get("coupon_type"))
            != _normalized(target.coupon_type)
            or _normalized(candidate.get("bond_type"))
            != _normalized(target.bond_type)
        ):
            excluded.append(
                {
                    "isin": isin,
                    "reason": "structure différente ou non prise en charge",
                }
            )
            continue

        score, matches, differences = _candidate_score(target, candidate)
        selected_candidates.append(
            {
                **candidate,
                "similarity_score": round(score, 2),
                "matches": matches,
                "differences": differences,
            }
        )

    selected_candidates.sort(
        key=lambda item: (
            -item["similarity_score"],
            abs((item["maturity_date"] - target.maturity_date).days)
            if isinstance(item.get("maturity_date"), date)
            else float("inf"),
            str(item.get("isin") or ""),
        )
    )
    selected = selected_candidates[:limit]
    excluded.extend(
        {
            "isin": item.get("isin", ""),
            "reason": f"rang inférieur au seuil de sélection (score {item['similarity_score']:.2f}/100)",
        }
        for item in selected_candidates[limit:]
    )

    data_statuses = sorted(
        {str(item.get("data_status") or "unknown") for item in selected}
    )
    market_dates = sorted(
        {
            item["market_date"].isoformat()
            for item in selected
            if isinstance(item.get("market_date"), date)
        }
    )
    flags = []
    if not selected:
        flags.append("Aucun comparable admissible trouvé.")
    if "synthetic_demo" in data_statuses:
        flags.append(
            "Le jeu utilisé est synthétique ; ses spreads ne sont pas des cotations de marché."
        )
    if any(not isinstance(item.get("market_date"), date) for item in selected):
        flags.append(
            "La date d'observation des comparables est absente ; aucune estimation à la date cible n'est autorisée."
        )
    elif any(
        item.get("market_date") != target.observation_date
        for item in selected
    ):
        flags.append(
            "Les dates de marché des comparables ne correspondent pas à la date cible."
        )
    if any(item.get("spread_bps") is None for item in selected):
        flags.append(
            "Un ou plusieurs comparables n'ont pas de spread source."
        )
    if any(not str(item.get("source_name") or "").strip() for item in selected):
        flags.append(
            "La source de marché d'un ou plusieurs comparables est absente."
        )
    if any(item.get("market_date") != target.observation_date for item in selected):
        flags.append(
            "Aucun spread de marché vérifié n'est disponible à la date d'observation cible."
        )
    if any(item.get("data_status") != "official" for item in selected):
        flags.append(
            "La provenance des données de marché n'est pas certifiée par un fournisseur licencié."
        )
    flags.append(
        "La liquidité bid/ask et une courbe zéro EUR datée ne sont pas présentes dans ce référentiel."
    )
    if any(item.get("esg_score") is not None for item in selected):
        flags.append(
            "Les scores ESG sont synthétiques ou non vérifiés et ne contribuent pas au score de comparabilité."
        )

    methodology_weights = ", ".join(
        f"{_WEIGHT_LABELS[criterion]} {_WEIGHTS[criterion]} %"
        for criterion in _WEIGHTS
    )
    return {
        "target": {
            "isin": target.isin,
            "issuer": target.issuer,
            "sector": target.sector,
            "rating": target.rating,
            "seniority": target.seniority,
            "currency": target.currency,
            "maturity_date": target.maturity_date.isoformat(),
            "observation_date": target.observation_date.isoformat(),
            "coupon_type": target.coupon_type,
            "coupon_rate_pct": target.coupon_rate_pct,
        },
        "selected": selected,
        "excluded": excluded,
        "methodology": (
            "Devise identique et exclusion de l'ISIN cible sont des filtres "
            "bloquants. Les autres critères sont notés sur 100 puis pondérés : "
            f"{methodology_weights}. Le critère secteur / type d'émetteur compare "
            "la valeur cible au champ issuer_type disponible. "
            "L'écart de maturité retire 20 points par an ; "
            "l'écart de notation retire 25 points par cran. Les égalités "
            "catégorielles valent 100, les différences ou données manquantes 0. "
            "Les ex aequo sont départagés par l'écart de maturité puis l'ISIN."
        ),
        "weights": _WEIGHTS,
        "data_statuses": data_statuses,
        "market_dates": market_dates,
        "valuation_allowed": False,
        "quality_flags": flags,
        "spread_label": "spread source (proxy synthétique, pas un Z-spread)",
    }
