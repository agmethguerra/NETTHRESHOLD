"""Pruebas de regresión y de comparación con métodos de referencia (T-D05, T-D06)."""
import numpy as np
import pytest

from backend.core.methods import (
    bisection,
    newton,
    reference_roots,
    scan_crossings,
    secant,
    suggest_initial_points,
)
from backend.core.metrics import poly_deriv_coeffs, poly_eval
from backend.core.muller import muller
from backend.core.regression import FitError, fit_polynomial

TRUE = [5.0, 0.4, 0.02, 0.0008]


def sample(xs, coeffs=TRUE):
    return [float(poly_eval(coeffs, x)) for x in xs]


def test_recovers_exact_cubic():
    xs = [10, 20, 30, 40, 50, 60, 70]
    fit = fit_polynomial(xs, sample(xs))
    assert fit["coefficients"] == pytest.approx(TRUE, rel=1e-6, abs=1e-9)
    assert fit["rmse"] < 1e-8
    assert fit["r2"] == pytest.approx(1.0)
    assert fit["x_min"] == 10 and fit["x_max"] == 70
    assert fit["distinct_levels"] == 7
    assert fit["warnings"] == []


def test_large_scale_loads_stay_well_conditioned():
    xs = [1000, 2000, 3000, 4000, 5000, 6000]
    coeffs = [8.0, 0.01, 2e-6, 3e-10]
    fit = fit_polynomial(xs, sample(xs, coeffs))
    assert fit["coefficients"] == pytest.approx(coeffs, rel=1e-5)


def test_noisy_data_gives_metrics():
    rng = np.random.default_rng(42)
    xs = list(range(10, 100, 10))
    ys = [y + float(rng.normal(0, 0.5)) for y in sample(xs)]
    fit = fit_polynomial(xs, ys)
    assert fit["rmse"] > 0
    assert 0.9 < fit["r2"] <= 1.0
    assert len(fit["residuals"]) == len(xs)


def test_replicates_are_used_in_regression():
    xs = [10, 10, 20, 20, 30, 30, 40, 40, 50, 50]
    fit = fit_polynomial(xs, sample(xs))
    assert fit["n_points"] == 10 and fit["distinct_levels"] == 5


def test_d05_insufficient_levels():
    with pytest.raises(FitError) as e:
        fit_polynomial([10, 20, 30], [1, 2, 3])
    assert e.value.code == "insufficient_data"
    with pytest.raises(FitError) as e:  # muchos puntos pero solo 3 niveles
        fit_polynomial([10, 10, 20, 20, 30, 30], [1, 1.1, 2, 2.1, 3, 3.1])
    assert e.value.code == "insufficient_data"


def test_d05_all_zero_load_is_singular_or_insufficient():
    with pytest.raises(FitError):
        fit_polynomial([0, 0, 0, 0], [1, 2, 3, 4])


def test_non_finite_and_mismatched_inputs():
    with pytest.raises(FitError) as e:
        fit_polynomial([1, 2, 3, float("nan")], [1, 2, 3, 4])
    assert e.value.code == "invalid_input"
    with pytest.raises(FitError) as e:
        fit_polynomial([1, 2, 3, 4], [1, 2, 3])
    assert e.value.code == "invalid_input"


def test_exactly_four_levels_warns_no_quality_assessment():
    xs = [10, 20, 30, 40]
    fit = fit_polynomial(xs, sample(xs))
    assert any("cuatro" in w or "4" in w or "niveles" in w for w in fit["warnings"])


def test_non_monotonic_curve_warns():
    xs = [10, 20, 30, 40, 50, 60]
    ys = [50, 30, 20, 25, 40, 70]
    fit = fit_polynomial(xs, ys)
    assert any("creciente" in w for w in fit["warnings"])


# ---- Métodos de referencia -------------------------------------------------------------

def make_g(threshold):
    return lambda x: poly_eval(TRUE, x) - threshold  # acepta x real o complejo


def test_reference_methods_agree_with_muller():
    threshold = 100.0
    g = make_g(threshold)
    d = poly_deriv_coeffs(TRUE)
    ref = reference_roots(TRUE, threshold)
    pos = [r for r in ref["real"] if r > 0]
    assert len(pos) == 1
    m = muller(g, 30.0, 40.0, 50.0)
    s = secant(g, 40.0, 50.0)
    n = newton(g, lambda x: float(poly_eval(d, x)), 50.0)
    b = bisection(g, 0.0, 100.0)
    for res in (m, s, n, b):
        assert res["status"] == "converged"
        assert res["root"] == pytest.approx(pos[0], abs=1e-6)


def test_bisection_requires_sign_change():
    assert bisection(make_g(1e6), 0.0, 10.0)["status"] == "invalid_input"


def test_suggested_points_lead_muller_to_crossing():
    xs_range = (10.0, 70.0)
    s = suggest_initial_points(TRUE, 100.0, *xs_range)
    assert s["found"] is True
    assert len({s["x0"], s["x1"], s["x2"]}) == 3
    r = muller(make_g(100.0), s["x0"], s["x1"], s["x2"])
    assert r["status"] == "converged"
    assert xs_range[0] <= r["root"] <= xs_range[1]


def test_no_crossing_inside_range_is_reported():
    s = suggest_initial_points(TRUE, 10_000.0, 10.0, 70.0)
    assert s["found"] is False
    assert s["crossings"] == 0
    assert any("RN-13" in w for w in s["warnings"])
    assert scan_crossings(TRUE, 10_000.0, 10.0, 70.0) == []
