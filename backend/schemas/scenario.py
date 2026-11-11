"""Esquemas de mediciones y validación de conjuntos."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

MAX_POINTS = 50_000  # límite de tamaño para evitar importaciones excesivas (sección 16.1)


class PointIn(BaseModel):
    """Una medición. x e y son permisivos a propósito: el backend decide por fila si son válidos
    y devuelve el motivo del rechazo en lugar de fallar toda la solicitud."""

    x: Any = None
    y: Any = None
    row: int | None = None
    load_unit: str | None = None
    metric_unit: str | None = None


class ValidateRequest(BaseModel):
    load_unit: str | None = None
    metric_unit: str | None = None
    points: list[PointIn] = Field(max_length=MAX_POINTS)
