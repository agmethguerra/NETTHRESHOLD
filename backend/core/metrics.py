"""Evaluación de polinomios y métricas de calidad de ajuste."""
from __future__ import annotations

import math
from typing import Sequence, Union

Number = Union[float, complex]


def poly_eval(coeffs: Sequence[float], x: Number) -> Number:
    """Evalúa a0 + a1·x + a2·x² + ... con el esquema de Horner.

    Funciona tanto con x real como complejo (Müller puede visitar valores complejos).
    """
    result: Number = 0.0
    for c in reversed(list(coeffs)):
        result = result * x + c
    return result


def poly_deriv_coeffs(coeffs: Sequence[float]) -> list[float]:
    """Coeficientes (orden ascendente) de la derivada del polinomio."""
    d = [k * c for k, c in enumerate(coeffs)][1:]
    return d or [0.0]


def residuals(ys: Sequence[float], yhat: Sequence[float]) -> list[float]:
    return [float(y) - float(h) for y, h in zip(ys, yhat)]


def rmse(ys: Sequence[float], yhat: Sequence[float]) -> float:
    n = len(ys)
    if n == 0:
        raise ValueError("No hay datos para calcular RMSE.")
    return math.sqrt(sum((float(y) - float(h)) ** 2 for y, h in zip(ys, yhat)) / n)


def r_squared(ys: Sequence[float], yhat: Sequence[float]) -> float | None:
    """R². Devuelve None cuando no está definido (varianza total nula)."""
    n = len(ys)
    if n == 0:
        return None
    mean = sum(float(y) for y in ys) / n
    ss_tot = sum((float(y) - mean) ** 2 for y in ys)
    if ss_tot == 0:
        return None
    ss_res = sum((float(y) - float(h)) ** 2 for y, h in zip(ys, yhat))
    return 1.0 - ss_res / ss_tot
