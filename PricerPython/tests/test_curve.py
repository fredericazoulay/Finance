import math

import pytest

from curve import (
    CurveNode,
    SwapPoint,
    bootstrap_zero_curve,
    zero_rate_at,
    zero_rate_function,
)


def test_bootstrap_recovers_discount_factors():
    swaps = [
        SwapPoint(0.5, 0.02),
        SwapPoint(1.0, 0.022),
        SwapPoint(2.0, 0.025),
        SwapPoint(3.0, 0.03),
    ]
    nodes = bootstrap_zero_curve(swaps, frequency=2)

    assert [node.years for node in nodes] == [0.5, 1.0, 2.0, 3.0]

    # Bootstrap semestriel explicite sur les deux premiers points.
    df_05 = 1 / (1 + 0.02 / 2)
    df_1 = (1 - (0.022 / 2) * df_05) / (1 + 0.022 / 2)
    assert nodes[0].zero_rate == pytest.approx(-math.log(df_05) / 0.5)
    assert nodes[1].zero_rate == pytest.approx(-math.log(df_1) / 1.0)

    # La courbe est croissante et les taux restent proches des swaps au pair.
    rates = [node.zero_rate for node in nodes]
    assert rates == sorted(rates)
    assert all(abs(rate - swap.par_rate) < 0.01 for rate, swap in zip(rates, swaps))


def test_bootstrap_sorts_and_rejects_invalid_swaps():
    nodes = bootstrap_zero_curve([SwapPoint(2.0, 0.025), SwapPoint(1.0, 0.02)])
    assert [node.years for node in nodes] == [1.0, 2.0]

    with pytest.raises(ValueError, match="vide"):
        bootstrap_zero_curve([])
    with pytest.raises(ValueError, match="distinctes"):
        bootstrap_zero_curve([SwapPoint(1.0, 0.02), SwapPoint(1.0, 0.03)])
    with pytest.raises(ValueError, match="entre 0 et 100"):
        bootstrap_zero_curve([SwapPoint(0.0, 0.02)])
    with pytest.raises(ValueError, match="entre -50 % et 100 %"):
        bootstrap_zero_curve([SwapPoint(1.0, 2.0)])
    with pytest.raises(ValueError, match="fréquence"):
        bootstrap_zero_curve([SwapPoint(1.0, 0.02)], frequency=3)


def test_zero_rate_at_interpolates_linearly_and_extrapolates_flat():
    nodes = [CurveNode(1, 0.02), CurveNode(3, 0.04)]

    assert zero_rate_at(2, nodes) == pytest.approx(0.03)
    assert zero_rate_at(1, nodes) == pytest.approx(0.02)
    assert zero_rate_at(0.5, nodes) == pytest.approx(0.02)
    assert zero_rate_at(10, nodes) == pytest.approx(0.04)

    zero_fn = zero_rate_function(nodes)
    assert zero_fn(2.5) == pytest.approx(0.035)

    with pytest.raises(ValueError, match="au moins un point"):
        zero_rate_at(1, [])
