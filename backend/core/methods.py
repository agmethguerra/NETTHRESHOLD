"""Métodos de referencia (secante, Newton-Raphson, bisección, raíces algebraicas) y
ayudas para elegir aproximaciones iniciales. Se usan para verificar y comparar con Müller
bajo las mismas condiciones (sección 8.9 y 17.6)."""
from __future__ import annotations

import math
from typing import Callable, Sequence

import numpy as np

from .metrics import poly_deriv_coeffs, poly_eval


def _result(method: str, status: str, message: str, root=None, iterations=0, residual=None) -> dict:
    return {
        "method": method, "status": status, "message": message,
        "root": root, "iterations_count": iterations, "residual": residual,
    }


def secant(g: Callable[[float], float], x0: float, x1: float, step_tol=1e-8, res_tol=1e-8,
           max_iter=100) -> dict:
    a, b = float(x0), float(x1)
    if a == b:
        return _result("secant", "invalid_input", "Se requieren dos puntos distintos.")
    for k in range(1, max_iter + 1):
        ga, gb = g(a), g(b)
        if not (math.isfinite(ga) and math.isfinite(gb)):
            return _result("secant", "numerical_error", "Valor no finito.", iterations=k)
        if gb == ga:
            return _result("secant", "numerical_error", "Pendiente nula.", iterations=k)
        c = b - gb * (b - a) / (gb - ga)
        step, res = abs(c - b), abs(g(c))
        if step <= step_tol and res <= res_tol:
            return _result("secant", "converged", "Convergencia alcanzada.", c, k, res)
        a, b = b, c
    return _result("secant", "not_converged", "Máximo de iteraciones alcanzado.", None, max_iter, abs(g(b)))


def newton(g: Callable[[float], float], dg: Callable[[float], float], x0: float, step_tol=1e-8,
           res_tol=1e-8, max_iter=100) -> dict:
    x = float(x0)
    for k in range(1, max_iter + 1):
        gx, dgx = g(x), dg(x)
        if not (math.isfinite(gx) and math.isfinite(dgx)):
            return _result("newton", "numerical_error", "Valor no finito.", iterations=k)
        if dgx == 0:
            return _result("newton", "numerical_error", "Derivada nula.", iterations=k)
        nx = x - gx / dgx
        step, res = abs(nx - x), abs(g(nx))
        if step <= step_tol and res <= res_tol:
            return _result("newton", "converged", "Convergencia alcanzada.", nx, k, res)
        x = nx
    return _result("newton", "not_converged", "Máximo de iteraciones alcanzado.", None, max_iter, abs(g(x)))


def bisection(g: Callable[[float], float], a: float, b: float, step_tol=1e-8, res_tol=1e-8,
              max_iter=200) -> dict:
    lo, hi = float(a), float(b)
    glo, ghi = g(lo), g(hi)
    if glo * ghi > 0:
        return _result("bisection", "invalid_input", "El intervalo no presenta cambio de signo.")
    for k in range(1, max_iter + 1):
        mid = (lo + hi) / 2
        gm = g(mid)
        if abs(hi - lo) / 2 <= step_tol and abs(gm) <= res_tol:
            return _result("bisection", "converged", "Convergencia alcanzada.", mid, k, abs(gm))
        if glo * gm <= 0:
            hi = mid
        else:
            lo, glo = mid, gm
    mid = (lo + hi) / 2
    return _result("bisection", "not_converged", "Máximo de iteraciones alcanzado.", None, max_iter, abs(g(mid)))


def reference_roots(coeffs: Sequence[float], threshold: float) -> dict:
    """Todas las raíces de P(x) - umbral = 0 mediante el método algebraico de numpy (referencia)."""
    poly = list(reversed([float(c) for c in coeffs]))
    poly[-1] -= float(threshold)
    poly = list(np.trim_zeros(np.array(poly), "f"))
    if len(poly) < 2:
        return {"real": [], "complex": []}
    roots = np.roots(poly)
    real, cplx = [], []
    for r in roots:
        if abs(r.imag) <= 1e-9 * max(1.0, abs(r.real)):
            real.append(float(r.real))
        else:
            cplx.append({"re": float(r.real), "im": float(r.imag)})
    return {"real": sorted(real), "complex": cplx}


def scan_crossings(coeffs: Sequence[float], threshold: float, x_min: float, x_max: float,
                   n: int = 2000) -> list[tuple[float, float]]:
    """Subintervalos de [x_min, x_max] donde g(x) = P(x) - umbral cambia de signo."""
    xs = np.linspace(x_min, x_max, n + 1)
    gs = np.array([poly_eval(coeffs, float(x)) - threshold for x in xs], dtype=float)
    out = []
    for i in range(n):
        if gs[i] == 0 or gs[i] * gs[i + 1] < 0:
            out.append((float(xs[i]), float(xs[i + 1])))
    return out


def suggest_initial_points(coeffs: Sequence[float], threshold: float, x_min: float,
                           x_max: float) -> dict:
    """Propone tres aproximaciones iniciales distintas para Müller (RF-13)."""
    span = x_max - x_min
    brackets = scan_crossings(coeffs, threshold, x_min, x_max)
    warnings: list[str] = []
    if not brackets:
        warnings.append(
            "El modelo no cruza el umbral dentro del rango calibrado; los datos no permiten "
            "estimarlo sin extrapolar (RN-13). Se sugieren puntos repartidos en el rango medido."
        )
        pts = [x_min + span * f for f in (0.25, 0.5, 0.75)]
        return {"found": False, "x0": pts[0], "x1": pts[1], "x2": pts[2],
                "crossings": 0, "warnings": warnings}
    if len(brackets) > 1:
        warnings.append(
            f"El modelo cruza el umbral {len(brackets)} veces dentro del rango; se sugiere el primer cruce."
        )
    r0 = (brackets[0][0] + brackets[0][1]) / 2
    delta = 0.1 * span
    pts = sorted({min(max(r0 - delta, x_min), x_max), r0, min(max(r0 + delta, x_min), x_max)})
    if len(pts) < 3:
        pts = [x_min, (x_min + x_max) / 2, x_max]
    return {"found": True, "x0": pts[0], "x1": pts[1], "x2": pts[2],
            "crossings": len(brackets), "bracket": list(brackets[0]), "warnings": warnings}
