"""Logica de negocio de CLIENTES.

No existe una tabla `cliente`: un cliente es la AGRUPACION de filas de `case_file`
que comparten el mismo RFC (la identidad canonica del cliente). Las filas legacy sin
RFC se tratan como un cliente singleton (clave = id del expediente) para no mezclar
personas distintas.

Este modulo agrega del lado del servidor y devuelve filas COMPACTAS (una por
cliente), de modo que el dashboard ya no descarga todos los expedientes de golpe:
- lista de clientes  -> /clientes
- expedientes de uno -> /clientes/{clave}/expedientes (carga diferida al hacer clic)
- autocompletado RFC -> /clientes/sugerencias
"""
from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.codes import CaseStatus
from app.models import CaseFile
from app.modules.expedientes import serializers
from app.modules.expedientes import service as exp_service
from app.schemas.base import iso


def _client_key(case: CaseFile) -> str:
    """Clave de agrupacion del cliente: el RFC (normalizado) o, si no hay, el id
    del expediente (cliente singleton legacy)."""
    rfc = (case.client_rfc or "").strip().upper()
    return rfc or str(case.id)


def list_clientes(
    db: Session,
    *,
    search: str | None = None,
    estado: str | None = None,
    desde: str | None = None,
    hasta: str | None = None,
    doc_faltante: str | None = None,
) -> list[dict]:
    """Lista de clientes agrupados por RFC con sus agregados (conteo por estado,
    monto total, urgencia, ultima actividad). Acepta los mismos filtros que la lista
    de expedientes (se aplican a nivel expediente antes de agrupar, igual que la
    vista anterior). Una sola pasada + queries batch (sin N+1)."""
    stmt = select(CaseFile).where(CaseFile.active_flag == 1)
    if search and search.strip():
        like = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                CaseFile.client_name.ilike(like),
                CaseFile.client_rfc.ilike(like),
                CaseFile.client_phone.ilike(like),
                CaseFile.client_email.ilike(like),
            )
        )
    if estado:
        stmt = stmt.where(CaseFile.status_code == estado)
    if desde:
        stmt = stmt.where(CaseFile.created_at >= dt.datetime.fromisoformat(desde))
    if hasta:
        stmt = stmt.where(CaseFile.created_at <= dt.datetime.fromisoformat(hasta))

    cases = list(db.execute(stmt).scalars())

    if doc_faltante:
        falt_map = serializers.documentos_faltantes_map(db, [c.id for c in cases])
        cases = [c for c in cases if doc_faltante in falt_map.get(c.id, [])]

    if not cases:
        return []

    ultima_map = serializers.ultima_actividad_map(db, [c.id for c in cases])

    grupos: dict[str, list[CaseFile]] = {}
    for c in cases:
        grupos.setdefault(_client_key(c), []).append(c)

    # ARCHIVED por cliente, INDEPENDIENTE de los filtros estado/fecha. Los archivados
    # viven en su propia seccion del detalle (retencion): su badge NO debe ocultarse
    # solo porque el dashboard tenga un filtro de estado activo (que si aplica al resto
    # del conteo). Query ligera aparte (2 columnas; los archivados son subconjunto chico).
    archivados_por_cliente: dict[str, int] = {}
    for cid, rfc in db.execute(
        select(CaseFile.id, CaseFile.client_rfc).where(
            CaseFile.active_flag == 1,
            CaseFile.status_code == CaseStatus.ARCHIVED,
        )
    ).all():
        akey = (rfc or "").strip().upper() or str(cid)
        archivados_por_cliente[akey] = archivados_por_cliente.get(akey, 0) + 1

    filas: list[tuple[int, float, dict]] = []
    for key, group in grupos.items():
        # Ordena el grupo por prioridad (misma regla que la lista de expedientes):
        # el head es el expediente mas urgente y aporta los datos representativos.
        group.sort(
            key=lambda c: (
                exp_service._prioridad(case=c, ultima_map=ultima_map),
                c.created_at,
            )
        )
        head = group[0]
        min_prio = exp_service._prioridad(case=head, ultima_map=ultima_map)

        conteo: dict[str, int] = {}
        for c in group:
            conteo[c.status_code] = conteo.get(c.status_code, 0) + 1
        # ARCHIVED refleja SIEMPRE el total real del cliente (no el filtrado), para que
        # la seccion "Archivados" del detalle sea consistente con lo que devuelve
        # ?archivados=true (que ignora filtros). El resto de estados si respeta el filtro.
        arch_n = archivados_por_cliente.get(key, 0)
        if arch_n:
            conteo["ARCHIVED"] = arch_n
        else:
            conteo.pop("ARCHIVED", None)

        tiene_urgente = any(
            exp_service._prioridad(case=c, ultima_map=ultima_map) == 0 for c in group
        )
        ultima = max(
            (serializers.ultima_actividad_de(c, ultima_map) for c in group),
            default=head.created_at,
        )
        monto_total = float(sum((c.estimated_amount or 0) for c in group))

        filas.append(
            (
                min_prio,
                monto_total,
                {
                    "id": key,
                    "rfc": head.client_rfc,
                    "nombre": head.client_name,
                    "telefono": head.client_phone or "",
                    "correo": head.client_email or "",
                    "montoTotal": monto_total,
                    "totalExpedientes": len(group),
                    "conteoPorEstado": conteo,
                    "tieneUrgente": tiene_urgente,
                    "ultimaActividad": iso(ultima),
                },
            )
        )

    # Clientes por urgencia (prioridad ascendente) y, a igualdad, mayor monto.
    filas.sort(key=lambda t: (t[0], -t[1]))
    return [fila[2] for fila in filas]


def expedientes_de_cliente(
    db: Session, clave: str, *, solo_archivados: bool = False
) -> list[CaseFile]:
    """Expedientes de un cliente. `clave` puede ser un RFC (cliente real) o un UUID
    (expediente legacy sin RFC).

    Por defecto EXCLUYE los archivados (viven en su propia seccion del detalle, para
    no meter ruido visual). Con solo_archivados=True devuelve UNICAMENTE los
    archivados, del mas reciente al mas antiguo (carga diferida al expandir)."""
    clave = (clave or "").strip()
    try:
        uid = uuid.UUID(clave)
        cond = CaseFile.id == uid
    except (ValueError, TypeError):
        cond = func.upper(CaseFile.client_rfc) == clave.upper()

    stmt = select(CaseFile).where(CaseFile.active_flag == 1, cond)
    if solo_archivados:
        stmt = stmt.where(CaseFile.status_code == CaseStatus.ARCHIVED)
    else:
        stmt = stmt.where(CaseFile.status_code != CaseStatus.ARCHIVED)

    cases = list(db.execute(stmt).scalars())
    if not cases:
        return []

    if solo_archivados:
        # Mas recientemente archivados primero (fallback a fecha de creacion).
        cases.sort(key=lambda c: (c.archived_at or c.created_at), reverse=True)
        return cases

    ultima_map = serializers.ultima_actividad_map(db, [c.id for c in cases])
    cases.sort(
        key=lambda c: (
            exp_service._prioridad(case=c, ultima_map=ultima_map),
            c.created_at,
        )
    )
    return cases


def sugerencias_rfc(db: Session, prefix: str, limit: int = 8) -> list[dict]:
    """Clientes cuyo RFC empieza con `prefix` (para el autocompletado del form de
    nueva venta). Devuelve datos representativos para prellenar (el mas reciente por
    RFC). Vacio si el prefijo es muy corto."""
    p = (prefix or "").strip().upper()
    if len(p) < 2:
        return []
    like = f"{p}%"
    rows = db.execute(
        select(CaseFile)
        .where(
            CaseFile.active_flag == 1,
            CaseFile.client_rfc.isnot(None),
            func.upper(CaseFile.client_rfc).like(like),
        )
        .order_by(CaseFile.created_at.desc())
    ).scalars()

    seen: dict[str, dict] = {}
    for c in rows:
        key = (c.client_rfc or "").strip().upper()
        if not key or key in seen:
            continue
        seen[key] = {
            "rfc": c.client_rfc,
            "nombre": c.client_name,
            "telefono": c.client_phone or "",
            "correo": c.client_email or "",
        }
        if len(seen) >= limit:
            break
    return list(seen.values())
