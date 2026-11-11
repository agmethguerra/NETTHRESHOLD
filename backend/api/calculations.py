"""Ejecución de Müller, sugerencia de puntos iniciales y comparación de métodos."""
import time

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ..core.methods import (
    bisection,
    newton,
    reference_roots,
    scan_crossings,
    secant,
    suggest_initial_points,
)
from ..core.metrics import poly_deriv_coeffs, poly_eval
from ..core.muller import muller
from ..core.validation import assess_root
from ..schemas.calculation import CompareRequest, MullerRequest, SuggestRequest

router = APIRouter(tags=["cálculo"])


@router.post("/muller/solve")
def solve(req: MullerRequest):
    coeffs = req.coefficients

    def g(x):
        return poly_eval(coeffs, x) - req.threshold

    result = muller(
        g, req.x0, req.x1, req.x2,
        step_tolerance=req.step_tolerance,
        residual_tolerance=req.residual_tolerance,
        max_iterations=req.max_iterations,
    )
    assessment = assess_root(result, req.x_min, req.x_max)
    warnings = list(result["warnings"]) + assessment.pop("assessment_warnings")
    root = result["root"]
    response = {
        **result,
        **assessment,
        "warnings": warnings,
        "root_unit": req.load_unit,
        "threshold": req.threshold,
        "metric_at_root": float(poly_eval(coeffs, root)) if root is not None else None,
        "reference_roots": reference_roots(coeffs, req.threshold),
    }
    if result["status"] == "invalid_input":
        return JSONResponse(status_code=422, content=response)
    return response


@router.post("/muller/suggest")
def suggest(req: SuggestRequest):
    if req.x_max <= req.x_min:
        return JSONResponse(status_code=422, content={
            "status": "invalid_input", "message": "x_max debe ser mayor que x_min."})
    return {"status": "ok", **suggest_initial_points(
        req.coefficients, req.threshold, req.x_min, req.x_max)}


def _timed(fn):
    t0 = time.perf_counter()
    out = fn()
    out["elapsed_ms"] = round((time.perf_counter() - t0) * 1000, 4)
    return out


@router.post("/compare/methods")
def compare(req: CompareRequest):
    coeffs, thr = req.coefficients, req.threshold
    dcoeffs = poly_deriv_coeffs(coeffs)

    def g(x):
        return poly_eval(coeffs, x) - thr

    def dg(x):
        return float(poly_eval(dcoeffs, x))

    st, rt, mi = req.step_tolerance, req.residual_tolerance, req.max_iterations

    def run_muller():
        r = muller(g, req.x0, req.x1, req.x2, st, rt, mi)
        root = r["root"] if r["status"] == "converged" else None
        return {"method": "muller", "status": r["status"], "message": r["message"], "root": root,
                "iterations_count": r["iterations_count"], "residual": r["residual"]}

    bracket = req.bracket
    if bracket is None and req.x_min is not None and req.x_max is not None and req.x_max > req.x_min:
        found = scan_crossings(coeffs, thr, req.x_min, req.x_max)
        bracket = list(found[0]) if found else None

    methods = [
        _timed(run_muller),
        _timed(lambda: secant(lambda x: float(g(x)), req.x1, req.x2, st, rt, mi)),
        _timed(lambda: newton(lambda x: float(g(x)), dg, req.x2, st, rt, mi)),
    ]
    if bracket is not None:
        methods.append(_timed(lambda: bisection(lambda x: float(g(x)), bracket[0], bracket[1], st, rt, max(mi, 200))))
    else:
        methods.append({
            "method": "bisection", "status": "not_applicable",
            "message": "No hay un intervalo con cambio de signo disponible.",
            "root": None, "iterations_count": 0, "residual": None, "elapsed_ms": 0.0,
        })

    return {
        "status": "ok",
        "methods": methods,
        "reference_roots": reference_roots(coeffs, thr),
        "note": "Las comparaciones usan la misma función y tolerancias. No se asume que Müller sea superior en todos los casos.",
    }
