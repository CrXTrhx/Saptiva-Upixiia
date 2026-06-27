"""Punto de entrada de la API (FastAPI). Solo la consume el frontend."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.db import ping
from app.core.errors import register_error_handlers
from app.integrations.storage import LOCAL_DIR

app = FastAPI(title="Saptiva AML API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_error_handlers(app)

# Sirve archivos del storage local en dev (en prod los sirve R2 directamente).
LOCAL_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/files", StaticFiles(directory=str(LOCAL_DIR)), name="files")


@app.get("/health")
def health():
    return {"status": "ok", "db": ping()}


def _include_routers() -> None:
    from app.modules.auth.router import router as auth_router
    from app.modules.canales.router import router as canales_router
    from app.modules.catalogos.router import router as catalogos_router
    from app.modules.clientes.router import router as clientes_router
    from app.modules.dashboard.router import router as dashboard_router
    from app.modules.documentos.router import router as documentos_router
    from app.modules.expedientes.router import router as expedientes_router
    from app.modules.huerfanos.router import router as huerfanos_router

    for r in (
        auth_router,
        expedientes_router,
        clientes_router,
        documentos_router,
        huerfanos_router,
        canales_router,
        catalogos_router,
        dashboard_router,
    ):
        app.include_router(r, prefix="/api")


_include_routers()
