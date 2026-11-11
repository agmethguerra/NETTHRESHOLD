"""Pruebas de integración de la API (contrato de la sección 14)."""
import pytest
from fastapi.testclient import TestClient

from backend.core.metrics import poly_eval
from backend.main import app

client = TestClient(app)
TRUE = [5.0, 0.4, 0.02, 0.0008]
XS = [10, 20, 30, 40, 50, 60, 70]
POINTS = [{"x": x, "y": float(poly_eval(TRUE, x))} for x in XS]


def post(path, body):
    return client.post(path, json=body)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_fit_returns_model_and_suggestion():
    r = post("/model/fit", {"model_type": "cubic", "load_unit": "req/s", "metric": "latency",
                            "metric_unit": "ms", "threshold": 100, "points": POINTS})
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "ok"
    assert d["coefficients"] == pytest.approx(TRUE, rel=1e-6, abs=1e-9)
    assert d["x_min"] == 10 and d["x_max"] == 70
    assert d["rmse"] < 1e-8 and d["r2"] == pytest.approx(1.0)
    assert d["suggestion"]["found"] is True


def test_fit_rejects_invalid_rows_with_reasons():
    pts = POINTS + [{"x": "abc", "y": 3, "row": 99}]
    r = post("/model/fit", {"points": pts})
    assert r.status_code == 422
    d = r.json()
    assert d["status"] == "invalid_input" and d["code"] == "invalid_points"
    assert d["rejected"][0]["row"] == 99 and "no numérico" in d["rejected"][0]["reason"]


def test_d05_fit_insufficient_data():
    r = post("/model/fit", {"points": POINTS[:3]})
    assert r.status_code == 422
    assert r.json()["status"] == "insufficient_data"


def test_fit_flags_duplicates():
    r = post("/model/fit", {"points": POINTS + [POINTS[0]]})
    assert r.status_code == 200
    assert r.json()["duplicates"] and any("duplicad" in w for w in r.json()["warnings"])


def test_validate_endpoint():
    r = post("/analysis/validate", {"load_unit": "req/s", "points": POINTS + [
        {"x": 5, "y": 1, "load_unit": "Mbps"}, {"x": "", "y": 1}]})
    d = r.json()
    assert r.status_code == 200
    assert d["valid_count"] == 7 and d["rejected_count"] == 2


def test_evaluate_endpoint():
    r = post("/analysis/evaluate", {"coefficients": TRUE, "xs": [0, 10, 20]})
    assert r.json()["ys"] == pytest.approx([float(poly_eval(TRUE, x)) for x in (0, 10, 20)])


def solve_body(**kw):
    body = {"coefficients": TRUE, "threshold": 100, "x0": 30, "x1": 40, "x2": 50,
            "x_min": 10, "x_max": 70, "load_unit": "req/s"}
    body.update(kw)
    return body


def test_solve_converges_and_is_valid_threshold():
    r = post("/muller/solve", solve_body())
    d = r.json()
    assert r.status_code == 200
    assert d["status"] == "converged" and d["root_is_real"] is True
    assert d["within_calibrated_range"] is True and d["valid_threshold"] is True
    assert d["root_unit"] == "req/s"
    assert d["metric_at_root"] == pytest.approx(100, abs=1e-6)
    assert d["root"] == pytest.approx(d["reference_roots"]["real"][-1], abs=1e-6) or any(
        d["root"] == pytest.approx(x, abs=1e-6) for x in d["reference_roots"]["real"])
    assert d["iterations_count"] == len(d["iterations"])


def test_d07_solve_root_outside_range_is_not_validated():
    # P(70) ≈ 405: un umbral de 600 solo se alcanza hacia x ≈ 81, fuera del rango medido [10, 70].
    r = post("/muller/solve", solve_body(threshold=600, x0=70, x1=80, x2=90))
    d = r.json()
    assert d["status"] == "converged"
    assert d["within_calibrated_range"] is False and d["valid_threshold"] is False
    assert any("fuera del rango" in w for w in d["warnings"])


def test_solve_repeated_points_is_422():
    r = post("/muller/solve", solve_body(x0=30, x1=30, x2=50))
    assert r.status_code == 422 and r.json()["status"] == "invalid_input"


def test_solve_not_converged_is_200_not_success():
    r = post("/muller/solve", solve_body(max_iterations=1, step_tolerance=1e-15, residual_tolerance=1e-15))
    d = r.json()
    assert r.status_code == 200
    assert d["status"] == "not_converged" and d["valid_threshold"] is False and d["root"] is None


def test_schema_errors_use_uniform_shape():
    r = post("/muller/solve", {"coefficients": [1], "threshold": 5, "x0": 1, "x1": 2, "x2": 3})
    d = r.json()
    assert r.status_code == 422 and d["status"] == "invalid_input" and d["errors"]


def test_suggest_and_compare():
    r = post("/muller/suggest", {"coefficients": TRUE, "threshold": 100, "x_min": 10, "x_max": 70})
    s = r.json()
    assert s["found"] is True

    r = post("/compare/methods", solve_body(x0=s["x0"], x1=s["x1"], x2=s["x2"]))
    d = r.json()
    assert r.status_code == 200
    by = {m["method"]: m for m in d["methods"]}
    assert set(by) == {"muller", "secant", "newton", "bisection"}
    roots = [m["root"] for m in d["methods"] if m["status"] == "converged"]
    assert len(roots) == 4 and max(roots) - min(roots) < 1e-5


def test_compare_without_bracket_marks_bisection_not_applicable():
    r = post("/compare/methods", {"coefficients": TRUE, "threshold": 100, "x0": 30, "x1": 40, "x2": 50})
    by = {m["method"]: m for m in r.json()["methods"]}
    assert by["bisection"]["status"] == "not_applicable"
