"""Validación de conjuntos de mediciones. La persistencia es local (IndexedDB), por lo que
la API no almacena escenarios: solo valida los datos que recibe."""
from fastapi import APIRouter

from ..core.validation import validate_points
from ..schemas.scenario import ValidateRequest

router = APIRouter(tags=["análisis"])


@router.post("/analysis/validate")
def validate(req: ValidateRequest):
    result = validate_points(
        [p.model_dump() for p in req.points], req.load_unit, req.metric_unit
    )
    return {"status": "ok", **result}
