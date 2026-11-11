"""Esquemas de ajuste, evaluación y cálculo numérico."""
from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field

from .scenario import MAX_POINTS, PointIn

Finite = Annotated[float, Field(allow_inf_nan=False)]
Coefficients = Annotated[list[Finite], Field(min_length=2, max_length=10)]


class FitRequest(BaseModel):
    model_type: Literal["cubic"] = "cubic"
    load_unit: str | None = None
    metric: str | None = None
    metric_unit: str | None = None
    threshold: Finite | None = None  # si se envía, se devuelven puntos iniciales sugeridos
    points: list[PointIn] = Field(max_length=MAX_POINTS)


class EvaluateRequest(BaseModel):
    coefficients: Coefficients
    xs: list[Finite] = Field(max_length=5000)


class MullerRequest(BaseModel):
    coefficients: Coefficients
    threshold: Finite
    x0: Finite
    x1: Finite
    x2: Finite
    step_tolerance: Finite = 1e-8
    residual_tolerance: Finite = 1e-8
    max_iterations: int = Field(100, ge=1, le=100_000)
    x_min: Finite | None = None   # rango calibrado, para verificar la raíz
    x_max: Finite | None = None
    load_unit: str | None = None


class SuggestRequest(BaseModel):
    coefficients: Coefficients
    threshold: Finite
    x_min: Finite
    x_max: Finite


class CompareRequest(MullerRequest):
    bracket: list[Finite] | None = Field(default=None, min_length=2, max_length=2)
