"""Runner del pipeline: ejecuta los pasos en orden sobre el contexto.

Los pasos que pueden rechazar (extraer, validar_calidad) hacen short-circuit de su
propia logica si el documento ya viene rechazado; pero persistir/actualizar/notificar
SIEMPRE corren para dejar registrado el rechazo y actualizar el expediente.
"""
from __future__ import annotations

from app.modules.pipeline import steps
from app.modules.pipeline.context import PipelineContext

# Orden del pipeline (insertar pasos nuevos de v1 al final).
STEPS = [
    steps.detectar_tipo,
    steps.extraer,
    steps.validar_calidad,
    steps.persistir,
    steps.actualizar_expediente,
    steps.notificar,
]


def run(ctx: PipelineContext) -> PipelineContext:
    for step in STEPS:
        step(ctx)
    return ctx
