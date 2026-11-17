from datetime import date

import pytest

from curve import CurveNode, zero_rate_function
from zspread import bond_cashflows, present_value, z_spread_from_price


def test_z_spread_matches_use_case_example():
    # Exemple chiffré du cas d'usage : prix 104,00 €, coupon 5 %/an sur 3 ans,
    # spots 2,00 % / 2,50 % / 3,00 % -> Z-spread attendu ~ 0,6025 % (60,25 pb).
    nodes = [CurveNode(1, 0.02), CurveNode(2, 0.025), CurveNode(3, 0.03)]
    zero_fn = zero_rate_function(nodes)
    flows = [(1.0, 5.0), (2.0, 5.0), (3.0, 105.0)]

    z = z_spread_from_price(flows, zero_fn, 104.00)

    assert z == pytest.approx(0.006025, abs=1e-5)
    assert z * 10000 == pytest.approx(60.25, abs=0.1)
    assert present_value(flows, zero_fn, z) == pytest.approx(104.00, abs=1e-9)


def test_bond_cashflows_lists_annual_coupons_and_redemption():
    flows = bond_cashflows(date(2025, 1, 1), date(2028, 1, 1), 0.05, 100.0, 1)

    assert [round(years, 6) for years, _ in flows] == [1.0, 2.0, 3.0]
    assert [amount for _, amount in flows] == [5.0, 5.0, 105.0]


def test_bond_cashflows_rejects_invalid_schedule():
    with pytest.raises(ValueError, match="antérieure"):
        bond_cashflows(date(2028, 1, 1), date(2028, 1, 1), 0.05)
    with pytest.raises(ValueError, match="fréquence"):
        bond_cashflows(date(2025, 1, 1), date(2028, 1, 1), 0.05, frequency=3)


def test_z_spread_rejects_invalid_inputs():
    zero_fn = zero_rate_function([CurveNode(1, 0.02)])
    flows = [(1.0, 105.0)]

    with pytest.raises(ValueError, match="strictement positif"):
        z_spread_from_price(flows, zero_fn, 0)
    with pytest.raises(ValueError, match="vide"):
        z_spread_from_price([], zero_fn, 100)
    with pytest.raises(ValueError, match="hors des bornes"):
        z_spread_from_price(flows, zero_fn, 1000)
    with pytest.raises(ValueError, match="hors des bornes"):
        z_spread_from_price(flows, zero_fn, 10)
