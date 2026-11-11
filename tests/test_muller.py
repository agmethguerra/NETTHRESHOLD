"""Pruebas del motor Müller (T-M01 … T-M08 de la especificación)."""
import cmath
import math

import pytest

from backend.core.muller import muller


def cubic(x):
    return x**3 - 6 * x**2 + 11 * x - 6  # raíces 1, 2, 3


def test_m01_polynomial_real_root():
    r = muller(cubic, 0.0, 0.5, 1.5)
    assert r["status"] == "converged"
    assert r["root_is_real"] is True
    assert any(abs(r["root"] - t) < 1e-6 for t in (1, 2, 3))
    assert r["residual"] <= 1e-8
    assert r["step"] <= 1e-8
    assert r["iterations_count"] == len(r["iterations"]) > 0


def test_m01_linear_function_one_iteration():
    r = muller(lambda x: 2 * x - 3, 0.0, 1.0, 5.0)
    assert r["status"] == "converged"
    assert r["root"] == pytest.approx(1.5, abs=1e-9)


def test_exact_root_at_x2():
    r = muller(lambda x: x - 2, 0.0, 1.0, 2.0)
    assert r["status"] == "converged"
    assert r["root"] == pytest.approx(2.0)
    assert r["residual"] == 0.0


def test_m02_complex_conjugate_roots():
    r = muller(lambda x: x * x + 1, 0.0, 1.0, 2.0)
    assert r["status"] == "converged"
    assert r["root_is_real"] is False
    assert r["root"] is None
    z = r["root_complex"]
    assert isinstance(z, dict)
    assert z["re"] == pytest.approx(0.0, abs=1e-6)
    assert abs(z["im"]) == pytest.approx(1.0, abs=1e-6)
    assert any("compleja" in w for w in r["warnings"])


def test_m03_non_polynomial_function():
    r = muller(lambda x: cmath.cos(x) - x, 0.0, 0.5, 1.0)
    assert r["status"] == "converged"
    assert r["root"] == pytest.approx(0.7390851332151607, abs=1e-7)


@pytest.mark.parametrize("pts", [(1, 1, 2), (1, 2, 2), (3, 2, 3)])
def test_m04_repeated_initial_points(pts):
    r = muller(cubic, *pts)
    assert r["status"] == "invalid_input"
    assert r["iterations"] == []


def test_m05_points_too_close():
    r = muller(cubic, 1.0, 1.0 + 1e-15, 2.0)
    assert r["status"] == "invalid_input"


def test_m06_near_zero_denominator():
    r = muller(lambda x: 5.0, 0.0, 1.0, 2.0)  # constante no nula: parábola sin raíz
    assert r["status"] == "numerical_error"
    assert r["root"] is None


def test_m07_max_iterations_reports_not_converged():
    r = muller(cubic, 10.0, 11.0, 12.0, step_tolerance=1e-14, residual_tolerance=1e-14, max_iterations=2)
    assert r["status"] == "not_converged"
    assert r["root"] is None
    assert r["iterations_count"] == 2


def test_m08_reproducible():
    a = muller(cubic, 0.0, 0.5, 1.5)
    b = muller(cubic, 0.0, 0.5, 1.5)
    assert a == b


def test_both_criteria_required():
    # Paso muy estricto imposible de cumplir en 1 iteración aunque el residuo sea pequeño.
    r = muller(cubic, 0.0, 0.5, 1.5, step_tolerance=1e-30, residual_tolerance=1e9, max_iterations=1)
    assert r["status"] == "not_converged"


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), "a", None, True])
def test_invalid_numeric_inputs(bad):
    assert muller(cubic, bad, 1.0, 2.0)["status"] == "invalid_input"


def test_invalid_tolerances_and_iterations():
    assert muller(cubic, 0, 1, 2, step_tolerance=0)["status"] == "invalid_input"
    assert muller(cubic, 0, 1, 2, residual_tolerance=-1)["status"] == "invalid_input"
    assert muller(cubic, 0, 1, 2, max_iterations=0)["status"] == "invalid_input"
    assert muller(cubic, 0, 1, 2, max_iterations=2.5)["status"] == "invalid_input"


def test_non_finite_function_value():
    r = muller(lambda x: complex("inf"), 0.0, 1.0, 2.0)
    assert r["status"] == "numerical_error"


def test_function_overflow_is_controlled():
    def boom(x):
        raise OverflowError("demasiado grande")

    assert muller(boom, 0.0, 1.0, 2.0)["status"] == "numerical_error"


def test_iteration_history_fields():
    r = muller(cubic, 0.0, 0.5, 1.5)
    it = r["iterations"][0]
    for key in ("iteration", "x0", "x1", "x2", "a", "b", "c", "discriminant", "x3", "step", "residual"):
        assert key in it
    assert it["iteration"] == 1
    assert math.isfinite(it["step"]) and math.isfinite(it["residual"])
