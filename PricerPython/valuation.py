"""Valorisation par Z-spread et archivage local des hypothèses."""

from __future__ import annotations

import json
import math
import sqlite3
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from curve import CurveNode
from pricing import (
    DayCount,
    SpreadObservation,
    _coupon_dates_around,
    bond_price,
    weighted_spread,
)


@dataclass(frozen=True)
class Comparable:
    name: str
    z_spread_bps: float | None
    similarity: float | None
    included: bool
    reason: str
    source: str


@dataclass(frozen=True)
class ObligationDetails:
    produit: str = ""
    type_obl: str = ""
    cusip: str = ""
    obligation: str = ""
    famille: str = ""
    sousfamille: str = ""
    type_bbg: str = ""
    convention_int: str = ""
    date_premier_cpn: date | None = None
    date_maturite_attendue: date | None = None
    date_annonce: date | None = None
    prix_remboursement: float = 100.0
    montant_emission: float | None = None
    type_conversion: str = ""
    calendrier: str = ""
    coupon_hybride: str = ""
    convention_calc: str = ""
    prix_emission: float | None = None
    lei: str = ""


@dataclass(frozen=True)
class ValuationRequest:
    issuer: str
    isin: str
    sector: str
    rating: str
    seniority: str
    currency: str
    observation_date: date
    settlement_date: date
    maturity_date: date
    coupon: float
    nominal: float
    frequency: int
    day_count: DayCount
    curve_source: str
    comparables: list[Comparable]
    curve: list[CurveNode]
    obligation_details: ObligationDetails = field(default_factory=ObligationDetails)
    type_bbg_verified: bool = False


def _validate_obligation_amounts(details: ObligationDetails) -> None:
    for name, value in (
        ("prix_remboursement", details.prix_remboursement),
        ("montant_emission", details.montant_emission),
        ("prix_emission", details.prix_emission),
    ):
        if value is not None and (not math.isfinite(value) or value <= 0):
            raise ValueError(f"{name} doit être un nombre strictement positif.")


def _validate_obligation_structure(request: ValuationRequest) -> None:
    details = request.obligation_details
    fixed_types = {"", "fixe", "taux fixe", "fixed", "fixed rate", "fixed-rate"}
    if details.type_obl.strip().casefold() not in fixed_types:
        raise ValueError("type_obl inconnu ou non compatible avec une obligation à taux fixe simple.")
    if details.type_bbg.strip() and not request.type_bbg_verified:
        raise ValueError("Le code type_bbg doit être vérifié manuellement pour confirmer une structure à taux fixe simple.")

    no_option = {"", "aucun", "aucune", "non", "none", "no", "false", "0"}
    for name in ("type_conversion", "coupon_hybride"):
        if getattr(details, name).strip().casefold() not in no_option:
            raise ValueError(f"{name} indique une structure non prise en charge.")

    if details.calendrier.strip().casefold() not in {"", "aucun", "aucune", "none", "sans ajustement"}:
        raise ValueError("Le calendrier indiqué nécessite un ajustement de dates non pris en charge.")
    if details.convention_calc.strip().casefold() not in {"", "aucun", "aucune", "none"}:
        raise ValueError("La convention_calc indiquée n'est pas prise en charge.")
    if details.convention_int and details.convention_int.strip().upper() != DayCount(request.day_count).value:
        raise ValueError("convention_int doit correspondre à la convention d'intérêts courus choisie.")


def _validate_obligation_dates(request: ValuationRequest) -> None:
    details = request.obligation_details
    if details.date_maturite_attendue and details.date_maturite_attendue != request.maturity_date:
        raise ValueError("Une maturité attendue différente de l'échéance n'est pas prise en charge.")
    if details.date_annonce and details.date_annonce > request.maturity_date:
        raise ValueError("La date d'annonce ne peut pas suivre la maturité.")
    first = details.date_premier_cpn
    if not first:
        return
    if first > request.maturity_date or first > request.settlement_date:
        raise ValueError("Le règlement avant le premier coupon ou un premier coupon après maturité n'est pas pris en charge.")
    if first == date.min:
        raise ValueError("La date du premier coupon est hors des bornes du calendrier.")
    if (request.maturity_date - first).days > 36525:
        raise ValueError("Le premier coupon est trop ancien pour ce moteur.")
    _, _, scheduled = _coupon_dates_around(
        first - timedelta(days=1), request.maturity_date, request.frequency
    )
    if first not in scheduled:
        raise ValueError("La date du premier coupon est irrégulière ; ce cas n'est pas pris en charge.")


def _validate_obligation(request: ValuationRequest) -> None:
    _validate_obligation_amounts(request.obligation_details)
    _validate_obligation_structure(request)
    _validate_obligation_dates(request)


def _interpolated_zero_rate(years: float, nodes: list[CurveNode]) -> float:
    if years <= nodes[0].years:
        return nodes[0].zero_rate
    for left, right in zip(nodes, nodes[1:]):
        if years <= right.years:
            fraction = (years - left.years) / (right.years - left.years)
            return left.zero_rate + fraction * (right.zero_rate - left.zero_rate)
    return nodes[-1].zero_rate


def obligation_snapshot(request: ValuationRequest) -> dict:
    return {
        "isin": request.isin,
        "emetteur": request.issuer,
        "secteur": request.sector,
        "date_maturite": request.maturity_date,
        "devise": request.currency,
        **asdict(request.obligation_details),
    }


def _yield_from_dirty_price(request: ValuationRequest, dirty_price: float) -> float:
    def price(rate: float) -> float:
        return bond_price(
            coupon=request.coupon,
            ytm=rate,
            settlement_date=request.settlement_date,
            maturity_date=request.maturity_date,
            nominal=request.nominal,
            frequency=request.frequency,
            day_count=request.day_count,
            redemption_percent=request.obligation_details.prix_remboursement,
        )["dirty_price"]

    lower = -0.9
    upper = 8.0
    if price(lower) < dirty_price:
        raise ValueError("Le rendement implicite est hors des bornes de calcul.")
    if price(upper) > dirty_price:
        raise ValueError("Le rendement implicite est hors des bornes de calcul.")
    for _ in range(100):
        middle = (lower + upper) / 2
        if price(middle) > dirty_price:
            lower = middle
        else:
            upper = middle
    return (lower + upper) / 2


def _validate_request(request: ValuationRequest) -> None:
    if not request.issuer.strip() or not request.currency.strip():
        raise ValueError("L'émetteur et la devise sont obligatoires.")
    if request.currency.upper() != "EUR":
        raise ValueError("Ce parcours ne traite que les obligations en EUR.")
    if not request.curve_source.strip():
        raise ValueError("Indiquez la source de la courbe zéro.")
    if request.observation_date > request.settlement_date:
        raise ValueError("La date d'observation ne peut pas suivre la date de règlement.")
    if (request.maturity_date - request.settlement_date).days > 36525:
        raise ValueError("La maturité ne peut dépasser 100 ans dans ce prototype.")
    if request.frequency not in (1, 2, 4, 12):
        raise ValueError("La fréquence doit être 1, 2, 4 ou 12 coupons par an.")
    if request.settlement_date >= request.maturity_date:
        raise ValueError("La date de règlement doit être antérieure à l'échéance.")
    _validate_obligation(request)


def _validate_curve(curve: list[CurveNode]) -> list[CurveNode]:
    nodes = sorted(curve, key=lambda node: node.years)
    if not nodes:
        raise ValueError("La courbe zéro doit contenir au moins un point.")
    for node in nodes:
        if not math.isfinite(node.years) or not math.isfinite(node.zero_rate):
            raise ValueError("Les points de courbe doivent être des nombres finis.")
        if not 0 < node.years <= 100 or not -0.5 <= node.zero_rate <= 1:
            raise ValueError("Les maturités doivent être entre 0 et 100 ans, les taux entre -50 % et 100 %.")
    if len({node.years for node in nodes}) != len(nodes):
        raise ValueError("Les maturités de la courbe zéro doivent être distinctes.")
    return nodes


def _validate_included_comparable(comparable: Comparable) -> None:
    if not comparable.source.strip():
        raise ValueError("La source est obligatoire pour chaque comparable retenu.")
    if comparable.z_spread_bps is None or comparable.similarity is None:
        raise ValueError("Chaque comparable retenu doit avoir un Z-spread et un score.")
    if not math.isfinite(comparable.z_spread_bps) or not -5000 <= comparable.z_spread_bps <= 5000:
        raise ValueError("Le Z-spread doit être compris entre -5 000 et 5 000 pb.")
    if not math.isfinite(comparable.similarity) or not 0 <= comparable.similarity <= 100:
        raise ValueError("Le score de similarité doit être compris entre 0 et 100.")


def _select_comparables(comparables: list[Comparable]) -> list[Comparable]:
    selected: list[Comparable] = []
    for comparable in comparables:
        if not comparable.name.strip():
            raise ValueError("Chaque comparable doit avoir un nom ou un ISIN.")
        if not comparable.included:
            if not comparable.reason.strip():
                raise ValueError("Un motif est obligatoire pour chaque comparable exclu.")
            continue
        _validate_included_comparable(comparable)
        selected.append(comparable)
    return selected


def _discounted_cashflows(
    request: ValuationRequest, nodes: list[CurveNode], z_spread: float
) -> tuple[list[dict], float]:
    _, _, coupon_dates = _coupon_dates_around(
        request.settlement_date, request.maturity_date, request.frequency
    )
    cashflows = []
    dirty_price = 0.0
    for payment_date in coupon_dates:
        years = (payment_date - request.settlement_date).days / 365
        zero_rate = _interpolated_zero_rate(years, nodes)
        amount = request.nominal * request.coupon / request.frequency
        if payment_date == request.maturity_date:
            amount += request.nominal * request.obligation_details.prix_remboursement / 100
        discount_base = 1 + zero_rate + z_spread / 10000
        if discount_base <= 0:
            raise ValueError("Le taux zéro augmenté du Z-spread est incompatible avec la capitalisation annuelle.")
        discount_factor = discount_base ** (-years)
        present_value = amount * discount_factor
        dirty_price += present_value
        cashflows.append(
            {
                "payment_date": payment_date.isoformat(),
                "years_act_365": years,
                "cashflow": amount,
                "zero_rate": zero_rate,
                "discount_factor": discount_factor,
                "present_value": present_value,
            }
        )
    return cashflows, dirty_price


def value_bond(request: ValuationRequest) -> dict:
    """Valoriser une obligation à taux fixe à partir d'une courbe zéro et d'un panel."""
    _validate_request(request)
    nodes = _validate_curve(request.curve)
    selected = _select_comparables(request.comparables)
    z_spread = weighted_spread(
        [SpreadObservation(item.z_spread_bps, item.similarity) for item in selected]
    )
    initial_price = bond_price(
        request.coupon,
        0,
        request.settlement_date,
        request.maturity_date,
        request.nominal,
        request.frequency,
        request.day_count,
        request.obligation_details.prix_remboursement,
    )
    cashflows, dirty_price = _discounted_cashflows(request, nodes, z_spread)
    ytm = _yield_from_dirty_price(request, dirty_price)
    best_spread = max(selected, key=lambda item: item.z_spread_bps)
    maturity_years = (request.maturity_date - request.settlement_date).days / 365
    return {
        "schema_version": 1,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "request": asdict(request),
        "obligation": obligation_snapshot(request),
        "methodology": {
            "spread": "Moyenne des Z-spreads pondérée par les similarités saisies.",
            "curve": "Taux zéro effectifs annuels, interpolation linéaire et extrapolation plate.",
            "discount": "(1 + taux zéro + Z-spread)^(-temps), temps ACT/365 fixe.",
            "yield": "YTM implicite correspondant au prix dirty, avec capitalisation à la fréquence du coupon.",
            "accrual": "Convention renseignée, selon le moteur pricing.py.",
            "selection": "Sélection et scores renseignés par l'utilisateur, non automatisés.",
        },
        "result": {
            "weighted_z_spread_bps": z_spread,
            "best_z_spread_bps": best_spread.z_spread_bps,
            "best_z_spread_name": best_spread.name,
            "clean_price": dirty_price - initial_price["accrued_interest"],
            "dirty_price": dirty_price,
            "accrued_interest": initial_price["accrued_interest"],
            "implied_ytm": ytm,
            "selected_count": len(selected),
            "curve_extrapolated": maturity_years > nodes[-1].years or cashflows[0]["years_act_365"] < nodes[0].years,
        },
        "cashflows": cashflows,
        "warnings": [
            "Prototype non validé pour la production ; les prix doivent être contrôlés par un expert.",
            "Courbe zéro issue de swaps EUR 6M à fournir : les taux swap au pair ne sont pas des taux zéro.",
            "Pas de calcul d'OAS, options, coupons irréguliers ou amortissements.",
        ],
    }


def report_json(report: dict) -> str:
    return json.dumps(report, ensure_ascii=False, indent=2, default=str, allow_nan=False)


def save_obligation(request: ValuationRequest, database_path: Path) -> int:
    if not request.issuer.strip() and not request.isin.strip():
        raise ValueError("Indiquez au moins un émetteur ou un ISIN pour enregistrer la fiche.")
    database_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """CREATE TABLE IF NOT EXISTS obligations (
                id INTEGER PRIMARY KEY,
                created_at_utc TEXT NOT NULL,
                fiche_json TEXT NOT NULL
            )"""
        )
        cursor = connection.execute(
            "INSERT INTO obligations (created_at_utc, fiche_json) VALUES (?, ?)",
            (datetime.now(timezone.utc).isoformat(), report_json(obligation_snapshot(request))),
        )
        if cursor.lastrowid is None:
            raise RuntimeError("L'enregistrement de la fiche a échoué.")
        return cursor.lastrowid


def list_obligations(database_path: Path) -> list[dict]:
    if not database_path.exists():
        return []
    with sqlite3.connect(database_path) as connection:
        if connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'obligations'"
        ).fetchone() is None:
            return []
        rows = connection.execute(
            "SELECT id, created_at_utc, fiche_json FROM obligations ORDER BY id DESC LIMIT 100"
        ).fetchall()
    return [
        {"id": row[0], "created_at_utc": row[1], "obligation": json.loads(row[2])}
        for row in rows
    ]


def save_report(report: dict, database_path: Path) -> int:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """CREATE TABLE IF NOT EXISTS valuations (
                id INTEGER PRIMARY KEY,
                created_at_utc TEXT NOT NULL,
                observation_date TEXT NOT NULL,
                issuer TEXT NOT NULL,
                report_json TEXT NOT NULL
            )"""
        )
        cursor = connection.execute(
            "INSERT INTO valuations (created_at_utc, observation_date, issuer, report_json) VALUES (?, ?, ?, ?)",
            (
                report["created_at_utc"],
                report["request"]["observation_date"].isoformat(),
                report["request"]["issuer"],
                report_json(report),
            ),
        )
        if cursor.lastrowid is None:
            raise RuntimeError("L'enregistrement de la valorisation a échoué.")
        return cursor.lastrowid


def list_reports(database_path: Path) -> list[dict]:
    if not database_path.exists():
        return []
    with sqlite3.connect(database_path) as connection:
        if connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'valuations'"
        ).fetchone() is None:
            return []
        rows = connection.execute(
            "SELECT id, created_at_utc, observation_date, issuer, report_json "
            "FROM valuations ORDER BY id DESC LIMIT 100"
        ).fetchall()
    return [
        {
            "id": row[0],
            "created_at_utc": row[1],
            "observation_date": row[2],
            "issuer": row[3],
            "report": json.loads(row[4]),
        }
        for row in rows
    ]
