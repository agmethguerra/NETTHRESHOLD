"""Método de Müller con aritmética compleja, controles numéricos e historial de iteraciones.

Referencia: sección 8.5–8.8 de la especificación. Se usa siempre aritmética compleja
(cmath) para que un discriminante negativo no corrompa el cálculo; al final se decide
si la raíz es real.
"""
from __future__ import annotations

import cmath
import math
from typing import Callable

Complex = complex

_TINY = 1e-14       # distancia relativa mínima entre aproximaciones consecutivas
_REAL_TOL = 1e-9    # parte imaginaria relativa tolerada para considerar la raíz real


def _fmt(z: Complex):
    """Serializa a JSON: número si es (prácticamente) real, {re, im} si no, None si no es finito."""
    z = complex(z)
    if not (math.isfinite(z.real) and math.isfinite(z.imag)):
        return None
    if abs(z.imag) <= 1e-12 * max(1.0, abs(z.real)):
        return z.real
    return {"re": z.real, "im": z.imag}


def _finite(*values: Complex) -> bool:
    return all(math.isfinite(complex(v).real) and math.isfinite(complex(v).imag) for v in values)


def _is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def muller(
    g: Callable[[Complex], Complex],
    x0: float,
    x1: float,
    x2: float,
    step_tolerance: float = 1e-8,
    residual_tolerance: float = 1e-8,
    max_iterations: int = 100,
) -> dict:
    """Busca una raíz de g con el método de Müller.

    Estados posibles: converged, not_converged, invalid_input, numerical_error.
    La convergencia exige simultáneamente paso pequeño y residuo pequeño (RN-10).
    """
    iterations: list[dict] = []
    warnings: list[str] = []

    def done(status: str, message: str, **extra) -> dict:
        out = {
            "status": status,
            "message": message,
            "root": None,
            "root_is_real": None,
            "root_complex": None,
            "residual": None,
            "step": None,
            "iterations_count": len(iterations),
            "iterations": iterations,
            "warnings": warnings,
        }
        out.update(extra)
        return out

    # ---- Validación de entradas (T-M04, T-M05) -------------------------------------
    if not all(_is_number(v) for v in (x0, x1, x2)):
        return done("invalid_input", "Las tres aproximaciones iniciales deben ser números finitos.")
    if not (_is_number(step_tolerance) and step_tolerance > 0 and _is_number(residual_tolerance)
            and residual_tolerance > 0):
        return done("invalid_input", "Las tolerancias deben ser números positivos y finitos.")
    if not isinstance(max_iterations, int) or isinstance(max_iterations, bool) or max_iterations < 1:
        return done("invalid_input", "El máximo de iteraciones debe ser un entero positivo.")
    if len({float(x0), float(x1), float(x2)}) < 3:
        return done("invalid_input", "Las tres aproximaciones iniciales deben ser distintas (RN-09).")
    scale0 = max(1.0, abs(x0), abs(x1), abs(x2))
    gaps = min(abs(x0 - x1), abs(x1 - x2), abs(x0 - x2))
    if gaps <= 1e-12 * scale0:
        return done(
            "invalid_input",
            "Las aproximaciones iniciales están numéricamente demasiado próximas entre sí.",
        )

    p0, p1, p2 = complex(x0), complex(x1), complex(x2)

    for k in range(1, max_iterations + 1):
        try:
            f0, f1, f2 = g(p0), g(p1), g(p2)
        except (OverflowError, ZeroDivisionError, ValueError) as exc:
            return done("numerical_error", f"Error al evaluar la función: {exc}")
        if not _finite(f0, f1, f2):
            return done("numerical_error", "La función produjo un valor no finito.")

        h1, h2 = p1 - p0, p2 - p1
        scale = max(1.0, abs(p0), abs(p1), abs(p2))
        if min(abs(h1), abs(h2), abs(p2 - p0)) <= _TINY * scale:
            return done(
                "numerical_error",
                "Las aproximaciones se volvieron numéricamente indistinguibles "
                "(diferencia casi nula); el método se estancó.",
                last_approximation=_fmt(p2),
            )

        d1 = (f1 - f0) / h1
        d2 = (f2 - f1) / h2
        a = (d2 - d1) / (h2 + h1)
        b = a * h2 + d2
        c = f2
        disc = b * b - 4 * a * c

        if c == 0:  # p2 ya es una raíz exacta
            iterations.append({
                "iteration": k, "x0": _fmt(p0), "x1": _fmt(p1), "x2": _fmt(p2),
                "a": _fmt(a), "b": _fmt(b), "c": _fmt(c), "discriminant": _fmt(disc),
                "denominator": None, "x3": _fmt(p2), "step": 0.0, "residual": 0.0,
            })
            p3, step, residual = p2, 0.0, 0.0
            return _finish_converged(done, p3, step, residual, warnings)

        d = cmath.sqrt(disc)
        e1, e2 = b + d, b - d
        e = e1 if abs(e1) >= abs(e2) else e2  # mayor magnitud: evita cancelación
        if not _finite(a, b, c, d, e) or abs(e) < 1e-300:
            return done(
                "numerical_error",
                "Denominador casi nulo o valores no finitos en la parábola interpolante.",
                last_approximation=_fmt(p2),
            )

        h = -2 * c / e
        p3 = p2 + h
        try:
            residual = abs(g(p3))
        except (OverflowError, ZeroDivisionError, ValueError) as exc:
            return done("numerical_error", f"Error al evaluar la función: {exc}")
        step = abs(h)
        if not (math.isfinite(step) and math.isfinite(residual) and _finite(p3)):
            return done("numerical_error", "Se obtuvo una aproximación no finita.",
                        last_approximation=_fmt(p2))

        iterations.append({
            "iteration": k, "x0": _fmt(p0), "x1": _fmt(p1), "x2": _fmt(p2),
            "a": _fmt(a), "b": _fmt(b), "c": _fmt(c), "discriminant": _fmt(disc),
            "denominator": _fmt(e), "x3": _fmt(p3), "step": step, "residual": residual,
        })

        if step <= step_tolerance and residual <= residual_tolerance:
            return _finish_converged(done, p3, step, residual, warnings)

        p0, p1, p2 = p1, p2, p3

    last = iterations[-1] if iterations else {}
    return done(
        "not_converged",
        f"Se alcanzó el máximo de {max_iterations} iteraciones sin cumplir ambos criterios de convergencia.",
        last_approximation=last.get("x3"),
        residual=last.get("residual"),
        step=last.get("step"),
    )


def _finish_converged(done, p3: Complex, step: float, residual: float, warnings: list[str]) -> dict:
    is_real = abs(p3.imag) <= _REAL_TOL * max(1.0, abs(p3.real))
    if is_real:
        root, message = p3.real, "Convergencia numérica alcanzada."
    else:
        root = None
        message = "Convergencia numérica a una raíz compleja."
        warnings.append("La raíz obtenida es compleja; no es interpretable como carga real.")
    return done(
        "converged", message,
        root=root, root_is_real=is_real, root_complex=_fmt(p3),
        residual=residual, step=step,
    )
