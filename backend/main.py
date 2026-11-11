"""Aplicación FastAPI de NetThreshold.

Ejecución local (desde la carpeta raíz del proyecto):

    uvicorn backend.main:app --reload

Además de la API, sirve el frontend estático en http://127.0.0.1:8000/ para que la primera
demostración se ejecute con un solo proceso y sin problemas de CORS. IndexedDB queda ligado
a ese origen (localhost:8000).
"""
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .api import calculations, modeling, scenarios

VERSION = "1.0.0"
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

app = FastAPI(
    title="NetThreshold API",
    version=VERSION,
    description="Ajuste de modelo cúbico y método de Müller para estimar el umbral de saturación de redes.",
)

# Permite abrir el frontend desde otro servidor local (p. ej. `python -m http.server`).
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    errors = [
        {"loc": ".".join(str(p) for p in e["loc"] if p != "body"), "message": str(e["msg"])}
        for e in exc.errors()
    ]
    detail = "; ".join(f"{e['loc']}: {e['message']}" if e["loc"] else e["message"] for e in errors)
    return JSONResponse(
        status_code=422,
        content={"status": "invalid_input", "message": f"Solicitud inválida: {detail}", "errors": errors},
    )


@app.get("/health", tags=["sistema"])
def health():
    return {"status": "ok", "service": "netthreshold", "version": VERSION}


app.include_router(scenarios.router)
app.include_router(modeling.router)
app.include_router(calculations.router)

if FRONTEND_DIR.is_dir():
    # Debe montarse al final: las rutas de la API tienen prioridad.
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
