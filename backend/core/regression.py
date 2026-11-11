"""Ajuste polinómico por mínimos cuadrados (modelo cúbico inicial, RF-10/RF-11)."""
from __future__ import annotations

from typing import Sequence

import numpy as np

from .metrics import r_squared, residuals, rmse


class FitError(Exception):
    """Fallo de ajuste con un código estable para que la API lo comunique."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def equation_string(coeffs: Sequence[float]) -> str:
    terms = []
    for k, c in enumerate(coeffs):
        if k == 0:
            terms.append(f"{c:.6g}")
        elif k == 1:
            terms.append(f"{c:+.6g}·λ")
        else:
            terms.append(f"{c:+.6g}·λ^{k}")
    return "R(λ) = " + " ".join(terms)


def fit_polynomial(xs: Sequence[float], ys: Sequence[float], degree: int = 3) -> dict:
    """Ajusta un polinomio de grado `degree` y devuelve coeficientes e indicadores.

    Se ajusta sobre la variable normalizada t = x / max|x| para mejorar el
    condicionamiento y luego se devuelven los coeficientes en la escala original.
    """
    if len(xs) != len(ys):
        raise FitError("invalid_input", "Las listas de carga y métrica deben tener igual longitud.")
    x = np.asarray(xs, dtype=float)
    y = np.asarray(ys, dtype=float)
    if x.size == 0:
        raise FitError("insufficient_data", "No hay mediciones para ajustar.")
    if not (np.all(np.isfinite(x)) and np.all(np.isfinite(y))):
        raise FitError("invalid_input", "Todos los valores deben ser finitos (sin NaN ni infinitos).")

    need = degree + 1
    distinct = int(np.unique(x).size)
    if distinct < need:
        raise FitError(
            "insufficient_data",
            f"Se requieren al menos {need} niveles de carga distintos para un ajuste de grado "
            f"{degree}; hay {distinct}.",
        )

    scale = float(np.max(np.abs(x)))
    if scale == 0.0:
        raise FitError("singular_fit", "Todas las cargas son cero; el ajuste es singular.")
    t = x / scale
    vander = np.vander(t, need, increasing=True)
    if np.linalg.matrix_rank(vander) < need:
        raise FitError("singular_fit", "La matriz de ajuste no tiene rango completo; ajuste singular.")

    c_scaled, *_ = np.linalg.lstsq(vander, y, rcond=None)
    coeffs = [float(ck) / scale**k for k, ck in enumerate(c_scaled)]
    if not all(np.isfinite(coeffs)):
        raise FitError("numerical_error", "El ajuste produjo coeficientes no finitos.")

    yhat = vander @ c_scaled
    x_min, x_max = float(np.min(x)), float(np.max(x))
    cond = float(np.linalg.cond(vander))

    warnings: list[str] = []
    if distinct <= need:
        warnings.append(
            f"Solo hay {distinct} niveles de carga distintos: el ajuste cúbico es exacto o casi "
            "exacto y RMSE/R² no permiten evaluar la calidad. Se recomiendan más de cuatro niveles."
        )
    if cond > 1e8:
        warnings.append(f"La matriz de ajuste está mal condicionada (cond≈{cond:.2e}).")

    # Coherencia física dentro del rango calibrado.
    grid = np.linspace(x_min, x_max, 400)
    asc = list(coeffs)
    values = np.polyval(asc[::-1], grid)
    slopes = np.polyval(np.polyder(np.poly1d(asc[::-1])).coeffs, grid)
    if float(np.min(values)) < 0:
        warnings.append("El modelo predice valores negativos de la métrica dentro del rango medido.")
    if float(np.min(slopes)) < 0:
        warnings.append(
            "La curva ajustada no es creciente en todo el rango medido; revise la gráfica y los residuos."
        )

    return {
        "model_type": "cubic" if degree == 3 else f"poly{degree}",
        "coefficients": coeffs,
        "equation": equation_string(coeffs),
        "x_min": x_min,
        "x_max": x_max,
        "rmse": rmse(y, yhat),
        "r2": r_squared(y, yhat),
        "n_points": int(x.size),
        "distinct_levels": distinct,
        "residuals": residuals(y, yhat),
        "condition_number": cond,
        "warnings": warnings,
    }
