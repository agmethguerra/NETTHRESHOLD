"""Validación de mediciones (RF-08, RN-02..RN-08) y evaluación física de la raíz (RN-11..RN-13)."""
from __future__ import annotations

import math
from collections import defaultdict
from typing import Any, Iterable

MIN_LEVELS_CUBIC = 4          # mínimo algebraico (4 coeficientes)
RECOMMENDED_LEVELS = 5        # "más de cuatro niveles" (RN-08)
NEAR_EDGE_FRACTION = 0.05     # raíz a menos del 5 % del borde del rango -> advertencia


def parse_number(value: Any) -> tuple[float | None, str | None]:
    """Convierte a float finito. Devuelve (valor, None) o (None, motivo)."""
    if value is None:
        return None, "valor faltante"
    if isinstance(value, bool):
        return None, "no numérico"
    if isinstance(value, (int, float)):
        num = float(value)
    else:
        s = str(value).strip()
        if s == "":
            return None, "valor faltante"
        if "_" in s:
            return None, "no numérico"
        if "," in s and "." not in s and s.count(",") == 1:
            s = s.replace(",", ".")  # coma decimal
        try:
            num = float(s)
        except ValueError:
            return None, "no numérico"
    if not math.isfinite(num):
        return None, "no finito"
    return num, None


def _norm_unit(u: Any) -> str:
    return str(u).strip().lower().replace(" ", "")


def validate_points(points: Iterable[dict], load_unit: str | None = None,
                    metric_unit: str | None = None) -> dict:
    """Valida filas {x, y, row?, load_unit?, metric_unit?} y resume el conjunto."""
    valid: list[dict] = []
    rejected: list[dict] = []
    total = 0
    for i, p in enumerate(points):
        total += 1
        row = p.get("row") if p.get("row") is not None else i + 1
        reasons: list[str] = []
        x, ex = parse_number(p.get("x"))
        y, ey = parse_number(p.get("y"))
        if ex:
            reasons.append(f"carga: {ex}")
        elif x < 0:
            reasons.append("carga negativa")
        if ey:
            reasons.append(f"métrica: {ey}")
        elif y < 0:
            reasons.append("métrica negativa")
        pu, pm = p.get("load_unit"), p.get("metric_unit")
        if load_unit and pu not in (None, "") and _norm_unit(pu) != _norm_unit(load_unit):
            reasons.append(f"unidad de carga incompatible ('{pu}' ≠ '{load_unit}')")
        if metric_unit and pm not in (None, "") and _norm_unit(pm) != _norm_unit(metric_unit):
            reasons.append(f"unidad de métrica incompatible ('{pm}' ≠ '{metric_unit}')")
        if reasons:
            rejected.append({"row": row, "reason": "; ".join(reasons),
                             "raw": {"x": p.get("x"), "y": p.get("y")}})
        else:
            valid.append({"row": row, "x": x, "y": y})

    # Duplicados exactos (se señalan, no se eliminan: RN-07).
    groups: dict[tuple[float, float], list[int]] = defaultdict(list)
    levels: dict[float, int] = defaultdict(int)
    for v in valid:
        groups[(v["x"], v["y"])].append(v["row"])
        levels[v["x"]] += 1
    duplicates = [{"x": k[0], "y": k[1], "rows": rows} for k, rows in groups.items() if len(rows) > 1]
    replicated = [{"x": x, "count": n} for x, n in sorted(levels.items()) if n > 1]

    distinct = len(levels)
    warnings: list[str] = []
    if duplicates:
        warnings.append(
            f"{len(duplicates)} medición(es) duplicada(s) exacta(s): confirme si son repeticiones válidas."
        )
    if 0 < distinct < MIN_LEVELS_CUBIC:
        warnings.append(
            f"Hay {distinct} niveles de carga distintos; el ajuste cúbico requiere al menos {MIN_LEVELS_CUBIC}."
        )
    elif distinct == MIN_LEVELS_CUBIC:
        warnings.append(
            "Con exactamente cuatro niveles el ajuste cúbico es exacto y no permite evaluar su calidad; "
            "se recomiendan más de cuatro niveles."
        )

    return {
        "total": total,
        "valid_count": len(valid),
        "rejected_count": len(rejected),
        "valid": valid,
        "rejected": rejected,
        "duplicates": duplicates,
        "replicated_levels": replicated,
        "distinct_levels": distinct,
        "enough_for_cubic": distinct >= MIN_LEVELS_CUBIC,
        "recommended_ok": distinct >= RECOMMENDED_LEVELS,
        "warnings": warnings,
    }


def assess_root(result: dict, x_min: float | None, x_max: float | None) -> dict:
    """Separa convergencia numérica de validez física (sección 15.2).

    Devuelve banderas y advertencias; `valid_threshold` solo es True si Müller convergió,
    la raíz es real, no negativa y está dentro del rango calibrado.
    """
    warnings: list[str] = []
    root = result.get("root")
    converged = result.get("status") == "converged"
    is_real = bool(result.get("root_is_real")) and root is not None
    non_negative = bool(is_real and root >= 0)
    in_range: bool | None = None

    if converged and result.get("root_is_real") is False:
        pass  # la advertencia de raíz compleja ya la añade el motor
    if is_real and not non_negative:
        warnings.append("La raíz es negativa; no es una carga físicamente interpretable (RN-11).")
    if is_real and x_min is not None and x_max is not None:
        in_range = x_min <= root <= x_max
        if not in_range:
            warnings.append(
                "La raíz está fuera del rango medido: es extrapolación y no se presenta como "
                "umbral validado (RN-12)."
            )
        else:
            span = x_max - x_min
            if span > 0 and min(root - x_min, x_max - root) <= NEAR_EDGE_FRACTION * span:
                warnings.append("La raíz está próxima al límite del rango calibrado.")
    elif is_real and (x_min is None or x_max is None):
        warnings.append("No se proporcionó el rango calibrado; no se pudo verificar la raíz.")

    return {
        "numerically_converged": converged,
        "root_is_real": is_real if converged else None,
        "root_non_negative": non_negative if converged else None,
        "within_calibrated_range": in_range,
        "valid_threshold": bool(converged and is_real and non_negative and in_range),
        "assessment_warnings": warnings,
    }
