"""Ajuste del modelo y evaluación de la curva."""
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ..core.methods import suggest_initial_points
from ..core.metrics import poly_eval
from ..core.regression import FitError, fit_polynomial
from ..core.validation import validate_points
from ..schemas.calculation import EvaluateRequest, FitRequest

router = APIRouter(tags=["modelado"])


def _invalid(status: str, code: str, message: str, **extra) -> JSONResponse:
    return JSONResponse(status_code=422, content={"status": status, "code": code,
                                                  "message": message, **extra})


@router.post("/model/fit")
def fit_model(req: FitRequest):
    validation = validate_points(
        [p.model_dump() for p in req.points], req.load_unit, req.metric_unit
    )
    if validation["rejected_count"]:
        return _invalid(
            "invalid_input", "invalid_points",
            f"{validation['rejected_count']} medición(es) inválida(s); corríjalas o elimínelas antes de ajustar.",
            rejected=validation["rejected"],
        )
    xs = [v["x"] for v in validation["valid"]]
    ys = [v["y"] for v in validation["valid"]]
    try:
        fit = fit_polynomial(xs, ys, degree=3)
    except FitError as exc:
        return _invalid(exc.code, exc.code, exc.message)

    if validation["duplicates"]:
        fit["warnings"].append(
            f"{len(validation['duplicates'])} medición(es) duplicada(s) exacta(s): "
            "confirme si son repeticiones válidas."
        )
    response = {
        "status": "ok",
        **fit,
        "load_unit": req.load_unit,
        "metric": req.metric,
        "metric_unit": req.metric_unit,
        "duplicates": validation["duplicates"],
        "replicated_levels": validation["replicated_levels"],
    }
    if req.threshold is not None:
        response["suggestion"] = suggest_initial_points(
            fit["coefficients"], req.threshold, fit["x_min"], fit["x_max"]
        )
    return response


@router.post("/analysis/evaluate")
def evaluate(req: EvaluateRequest):
    ys = [float(poly_eval(req.coefficients, x)) for x in req.xs]
    return {"status": "ok", "xs": req.xs, "ys": [y if y == y and abs(y) != float("inf") else None for y in ys]}
