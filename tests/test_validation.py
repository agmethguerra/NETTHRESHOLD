"""Pruebas de validación de datos y de evaluación física de la raíz (T-D03, T-D04, T-D07)."""
import pytest

from backend.core.validation import assess_root, parse_number, validate_points


def pts(*pairs, **extra):
    return [{"x": x, "y": y, **extra} for x, y in pairs]


def test_valid_rows_pass_through():
    out = validate_points(pts((10, 12.5), (20, 15.2), (30, 21.8), (40, 35.4), (50, 58.1)))
    assert out["valid_count"] == 5 and out["rejected_count"] == 0
    assert out["distinct_levels"] == 5 and out["enough_for_cubic"] and out["recommended_ok"]
    assert out["warnings"] == []


def test_d03_empty_text_and_non_finite_values_are_rejected_with_reason():
    out = validate_points(pts((10, ""), ("abc", 5), (None, 3), ("nan", 1), (20, "inf"), (30, 4)))
    assert out["valid_count"] == 1
    assert out["rejected_count"] == 5
    reasons = " | ".join(r["reason"] for r in out["rejected"])
    assert "faltante" in reasons and "no numérico" in reasons and "no finito" in reasons
    assert [r["row"] for r in out["rejected"]] == [1, 2, 3, 4, 5]  # filas, sin ocultar el motivo


def test_negative_values_rejected():
    out = validate_points(pts((-5, 1), (5, -1)))
    assert out["valid_count"] == 0
    assert "negativa" in out["rejected"][0]["reason"] and "negativa" in out["rejected"][1]["reason"]


def test_d04_incompatible_units():
    rows = [
        {"x": 10, "y": 1, "load_unit": "req/s", "metric_unit": "ms"},
        {"x": 20, "y": 2, "load_unit": "Mbps", "metric_unit": "ms"},
        {"x": 30, "y": 3, "load_unit": "req/s", "metric_unit": "s"},
        {"x": 40, "y": 4},  # sin unidad: se acepta, hereda la del escenario
    ]
    out = validate_points(rows, load_unit="req/s", metric_unit="ms")
    assert out["valid_count"] == 2
    assert {r["row"] for r in out["rejected"]} == {2, 3}


def test_unit_comparison_is_case_and_space_insensitive():
    out = validate_points([{"x": 1, "y": 1, "load_unit": " REQ/S ", "metric_unit": "MS"}],
                          load_unit="req/s", metric_unit="ms")
    assert out["valid_count"] == 1


def test_duplicates_flagged_but_kept():
    out = validate_points(pts((10, 5), (10, 5), (10, 6), (20, 7)))
    assert out["valid_count"] == 4
    assert out["duplicates"] == [{"x": 10.0, "y": 5.0, "rows": [1, 2]}]
    assert out["replicated_levels"] == [{"x": 10.0, "count": 3}]
    assert any("duplicad" in w for w in out["warnings"])


def test_insufficient_levels_warning():
    out = validate_points(pts((1, 1), (2, 2), (3, 3)))
    assert not out["enough_for_cubic"]
    assert any("al menos 4" in w for w in out["warnings"])


def test_explicit_row_numbers_are_kept():
    out = validate_points([{"x": "bad", "y": 1, "row": 17}])
    assert out["rejected"][0]["row"] == 17


@pytest.mark.parametrize("raw,expected", [("12,5", 12.5), ("1e3", 1000.0), (" 7 ", 7.0), (3, 3.0)])
def test_parse_number_ok(raw, expected):
    assert parse_number(raw) == (expected, None)


@pytest.mark.parametrize("raw", ["1_0", "1,2,3", "12.5.1", "", "  ", None, True])
def test_parse_number_rejects(raw):
    value, reason = parse_number(raw)
    assert value is None and reason


# ---- assess_root --------------------------------------------------------------------------

def conv(root, real=True):
    return {"status": "converged", "root": root, "root_is_real": real}


def test_valid_threshold_inside_range():
    a = assess_root(conv(40.0), 10.0, 70.0)
    assert a["valid_threshold"] is True and a["within_calibrated_range"] is True
    assert a["assessment_warnings"] == []


def test_d07_root_outside_range_not_validated():
    a = assess_root(conv(95.0), 10.0, 70.0)
    assert a["numerically_converged"] is True
    assert a["within_calibrated_range"] is False
    assert a["valid_threshold"] is False
    assert any("fuera del rango" in w for w in a["assessment_warnings"])


def test_negative_root_not_valid():
    a = assess_root(conv(-3.0), 10.0, 70.0)
    assert a["root_non_negative"] is False and a["valid_threshold"] is False


def test_complex_root_not_valid():
    a = assess_root({"status": "converged", "root": None, "root_is_real": False}, 10.0, 70.0)
    assert a["valid_threshold"] is False and a["root_is_real"] is False


def test_near_edge_warning_but_still_valid():
    a = assess_root(conv(69.0), 10.0, 70.0)
    assert a["valid_threshold"] is True
    assert any("próxima" in w for w in a["assessment_warnings"])


def test_not_converged_never_valid():
    a = assess_root({"status": "not_converged", "root": None}, 10.0, 70.0)
    assert a["valid_threshold"] is False and a["numerically_converged"] is False


def test_missing_range_cannot_validate():
    a = assess_root(conv(40.0), None, None)
    assert a["valid_threshold"] is False
