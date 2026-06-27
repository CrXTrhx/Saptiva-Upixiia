"""Carga MUCHOS datos de prueba (sinteticos) para explorar la API en /docs.

NO usa datos reales de personas. Recorre la logica real del backend (pipeline,
state machine, next steps, eventos, auditoria) para que el estado quede consistente.

Uso:
    python -m app.seed_demo            # agrega el set de demo
    python -m app.seed_demo --reset    # borra datos de negocio y vuelve a sembrar

Credenciales: admin@centur.com / admin123 (y capturistas ana@/luis@/diana@centur.com).
"""
from __future__ import annotations

import random
import re
import string
import sys

from sqlalchemy import select, text

from app.core.codes import (
    CaseStatus,
    Channel,
    ChecklistStatus,
    DocStatus,
    DocType,
    EventType,
)
from app.core.db import db_session, engine
from app.core.security import hash_password
from app.models import AppUser, CaseChecklistItem, CaseFile, Document
from app.modules.documentos import service as doc_service
from app.modules.eventos import registrar_evento
from app.modules.expedientes import next_steps as ns
from app.modules.expedientes import service as exp_service
from app.modules.expedientes.schemas import CreateExpedienteRequest
from app.modules.expedientes.state_machine import transition
from app.modules.huerfanos import service as orphan_service
from app.modules.llm import service as llm_service

random.seed(2026)

NOMBRES = [
    "Juan Perez", "Sofia Ramirez", "Carlos Hernandez", "Mariana Torres",
    "Diego Sanchez", "Valeria Gomez", "Fernando Reyes", "Laura Mendoza",
    "Ricardo Navarro", "Patricia Flores", "Andres Castillo", "Gabriela Ortiz",
    "Miguel Vargas", "Isabel Moreno", "Javier Luna", "Carmen Delgado",
    "Tomas Aguilar", "Elena Rios", "Roberto Pena", "Daniela Cruz",
    "Hector Medina", "Lucia Fuentes", "Pablo Romero", "Adriana Salas",
    "Oscar Cabrera", "Renata Vega", "Emilio Campos", "Natalia Soto",
    "Sergio Herrera", "Ximena Pacheco", "Raul Estrada", "Monica Guerra",
    "Alberto Nunez", "Paola Cordova", "Ivan Trejo", "Brenda Lozano",
    "Felipe Arias", "Veronica Mata", "Arturo Rangel", "Cecilia Ponce",
]
TIPOS = ["blindaje", "venta_vehiculo"]
MONTOS = [180000, 290000, 350000, 420000, 500000, 600000, 700000, 850000, 1200000]
CANALES = [Channel.WHATSAPP, Channel.EMAIL, Channel.DIRECT_UPLOAD]

DOC_FILE = {
    DocType.OFFICIAL_ID: "ine_{s}.jpg",
    DocType.CURP: "curp_{s}.pdf",
    DocType.TAX_STATUS_CERT: "constancia_fiscal_{s}.pdf",
    DocType.PROOF_OF_ADDRESS: "comprobante_domicilio_{s}.pdf",
}
ALL_TYPES = [DocType.OFFICIAL_ID, DocType.CURP, DocType.TAX_STATUS_CERT, DocType.PROOF_OF_ADDRESS]


def _slug(nombre: str) -> str:
    return nombre.lower().replace(" ", "_")


def _rfc(nombre: str) -> str:
    """RFC sintetico valido (persona fisica: 4 letras + 6 digitos + 3 homoclave)."""
    letras = re.sub(r"[^A-Z]", "", nombre.upper())
    letras = (letras + "XXXX")[:4]
    fecha = f"{random.randint(70, 99):02d}{random.randint(1, 12):02d}{random.randint(1, 28):02d}"
    homo = "".join(random.choices(string.ascii_uppercase + string.digits, k=3))
    return letras + fecha + homo


def _sender(channel: str, idx: int) -> str:
    if channel == Channel.WHATSAPP:
        return f"+5255{1000000 + idx:07d}"
    if channel == Channel.EMAIL:
        return f"cliente{idx}@correo.com"
    return "admin@centur.com"


def _add_doc(db, case, user, dtype, *, channel=None, filename=None):
    channel = channel or random.choice(CANALES)
    fn = filename or DOC_FILE[dtype].format(s=_slug(case.client_name))
    return doc_service.ingest_document(
        db, case,
        content=b"%PDF-1.4 demo synthetic document",
        file_name=fn, mime_type="application/pdf",
        channel=channel, sender=_sender(channel, random.randint(1, 9999)),
        declared_type=dtype, actor=user.email, actor_user_id=user.id,
    )


def _validate_all(db, case, user):
    docs = db.execute(
        select(Document).where(
            Document.case_file_id == case.id,
            Document.active_flag == 1,
            Document.status_code == DocStatus.RECEIVED,
        )
    ).scalars()
    for d in docs:
        doc_service.validar_documento(db, d, user)


def _backdate(db, case_id, days: int):
    if days <= 0:
        return
    for tbl, col in (("case_file", "created_at"), ("case_event", "event_at"),
                     ("document", "reception_at")):
        key = "id" if tbl == "case_file" else "case_file_id"
        db.execute(
            text(f"UPDATE {tbl} SET {col} = {col} - make_interval(days => :d) "
                 f"WHERE {key} = :cid"),
            {"d": days, "cid": str(case_id)},
        )


def _expire_comprobante(db, case, user):
    """Lleva un expediente a incompleto_vencido (comprobante vencido)."""
    doc = db.execute(
        select(Document).where(
            Document.case_file_id == case.id,
            Document.detected_type_code == DocType.PROOF_OF_ADDRESS,
            Document.active_flag == 1,
            Document.status_code.in_([DocStatus.RECEIVED, DocStatus.VALIDATED]),
        )
    ).scalars().first()
    if not doc:
        return
    doc.status_code = DocStatus.EXPIRED
    db.flush()
    item = db.execute(
        select(CaseChecklistItem).where(
            CaseChecklistItem.case_file_id == case.id,
            CaseChecklistItem.document_type_code == DocType.PROOF_OF_ADDRESS,
        )
    ).scalar_one_or_none()
    if item:
        item.status_code = ChecklistStatus.EXPIRED
        item.current_document_id = None
        db.flush()
    transition(db, case, CaseStatus.INCOMPLETE_EXPIRED, actor="cron",
               descripcion="Comprobante de domicilio vencido")
    registrar_evento(db, case.id, EventType.STATUS_CHANGED,
                     "Documento vencido, solicitar renovado", actor="cron")
    ns.recompute(db, case)


def _nota(db, case, user, texto):
    exp_service.agregar_nota(db, case, texto, user)


def _ensure_users() -> list[dict]:
    perfiles = [
        ("admin@centur.com", "Administrador", "admin123"),
        ("ana@centur.com", "Ana Lopez", "demo123"),
        ("luis@centur.com", "Luis Perez", "demo123"),
        ("diana@centur.com", "Diana Cruz", "demo123"),
    ]
    users = []
    with db_session(user_label="seed") as db:
        for email, name, pwd in perfiles:
            u = db.execute(select(AppUser).where(AppUser.email == email)).scalar_one_or_none()
            if not u:
                u = AppUser(email=email, password_hash=hash_password(pwd),
                            full_name=name, role_code="INTERNAL")
                db.add(u)
                db.flush()
            users.append({"id": u.id, "email": u.email, "full_name": u.full_name})
    # objetos ligeros con .id/.email/.full_name para pasar a los servicios
    class _U:
        def __init__(self, d): self.id, self.email, self.full_name = d["id"], d["email"], d["full_name"]
    return [_U(d) for d in users]


def _new_case(db, user, cliente: dict, monto, tipo) -> CaseFile:
    req = CreateExpedienteRequest(
        cliente_nombre=cliente["nombre"],
        cliente_telefono=cliente["telefono"],
        cliente_correo=cliente["correo"],
        cliente_rfc=cliente["rfc"],
        monto_estimado=monto,
        tipo_operacion=tipo,
    )
    return exp_service.create_expediente(db, req, user)


def _make_clientes(nombres: list[str], n: int) -> list[dict]:
    """Crea un pool de clientes con RFC fijo. Como cada expediente luego elige un
    cliente del pool al azar, varios clientes terminan con MAS DE UN expediente:
    asi se puede demostrar 'un cliente, muchos expedientes' (relacion por RFC)."""
    clientes = []
    for i in range(min(n, len(nombres))):
        nombre = nombres[i]
        clientes.append(
            {
                "nombre": nombre,
                "telefono": f"55{random.randint(10000000, 99999999)}",
                "correo": f"{_slug(nombre)}@correo.com",
                "rfc": _rfc(nombre),
            }
        )
    return clientes


def seed_demo() -> None:
    users = _ensure_users()
    nombres = NOMBRES.copy()
    random.shuffle(nombres)

    # Pool de ~16 clientes: hay menos clientes que expedientes (~39), asi que al
    # asignar cada expediente a un cliente al azar, varios quedan con multiples
    # expedientes (relacion cliente <- expedientes por RFC).
    clientes = _make_clientes(nombres, 16)

    plan = (
        # (estado_objetivo, cantidad)
        ("CAPTURING", 6),
        ("RECEIVING", 8),
        ("IN_VALIDATION", 6),
        ("COMPLETE", 8),
        ("INCOMPLETE_EXPIRED", 4),
        ("CANCELLED", 4),
        ("ARCHIVED", 3),
    )

    total = 0
    for objetivo, n in plan:
        for _ in range(n):
            user = random.choice(users)
            cliente = random.choice(clientes)
            nombre = cliente["nombre"]
            monto, tipo = random.choice(MONTOS), random.choice(TIPOS)
            with db_session(user_id=str(user.id), user_label=user.email) as db:
                case = _new_case(db, user, cliente, monto, tipo)
                cid = case.id

                if objetivo == "CAPTURING":
                    _backdate(db, cid, random.randint(0, 2))

                elif objetivo == "RECEIVING":
                    for dt in random.sample(ALL_TYPES, k=random.randint(1, 3)):
                        _add_doc(db, case, user, dt)
                    if random.random() < 0.5:
                        _nota(db, case, user, "Cliente confirmo que enviara el resto esta semana.")
                    # algunos inactivos (>3 dias) para disparar recordatorio
                    dias = random.choice([1, 2, 6, 9, 12])
                    _backdate(db, cid, dias)
                    db.refresh(case)
                    ns.recompute(db, case)

                elif objetivo == "IN_VALIDATION":
                    for dt in ALL_TYPES:
                        _add_doc(db, case, user, dt)
                    _backdate(db, cid, random.randint(1, 5))

                elif objetivo == "COMPLETE":
                    for dt in ALL_TYPES:
                        _add_doc(db, case, user, dt)
                    _validate_all(db, case, user)
                    db.refresh(case)
                    exp_service.marcar_completo(db, case, user)
                    if random.random() < 0.6:
                        llm_service.consultar(db, case, "Hay que avisar al SAT?", user)
                        llm_service.consultar(db, case, "Se puede pagar en efectivo?", user)
                    _backdate(db, cid, random.randint(8, 40))

                elif objetivo == "INCOMPLETE_EXPIRED":
                    for dt in ALL_TYPES:
                        _add_doc(db, case, user, dt)
                    _validate_all(db, case, user)
                    db.refresh(case)
                    _expire_comprobante(db, case, user)
                    _backdate(db, cid, random.randint(20, 45))

                elif objetivo == "CANCELLED":
                    if random.random() < 0.5:
                        _add_doc(db, case, user, DocType.OFFICIAL_ID)
                    db.refresh(case)
                    exp_service.cancelar(db, case, "cliente desistio de la compra", user)
                    _backdate(db, cid, random.randint(10, 30))

                elif objetivo == "ARCHIVED":
                    for dt in ALL_TYPES:
                        _add_doc(db, case, user, dt)
                    _validate_all(db, case, user)
                    db.refresh(case)
                    exp_service.marcar_completo(db, case, user)
                    exp_service.archivar(db, case, user)
                    _backdate(db, cid, random.randint(30, 60))

                total += 1
            print(f"  [{total:02d}] {objetivo:18s} {nombre}")

    # Un caso con CURP para demostrar el match automatico de huerfanos
    with db_session(user_label="seed") as db:
        any_recv = db.execute(
            select(CaseFile).where(CaseFile.status_code == CaseStatus.RECEIVING)
            .limit(1)
        ).scalar_one_or_none()
        if any_recv:
            db.execute(
                text("UPDATE case_file SET client_curp = :c WHERE id = :id"),
                {"c": "PEPJ900101HDFRRN09", "id": str(any_recv.id)},
            )

    # Documentos huerfanos (llegaron sin codigo de expediente)
    huerfanos = [
        (Channel.WHATSAPP, "+525540001111", "ine_persona_desconocida.jpg", "Hola, les mando mi identificacion"),
        (Channel.EMAIL, "remitente1@correo.com", "curp_sin_codigo.pdf", "Adjunto mi CURP"),
        (Channel.WHATSAPP, "+525540002222", "comprobante_domicilio.pdf", "mi comprobante"),
        (Channel.EMAIL, "remitente2@correo.com", "constancia_fiscal.pdf", "constancia"),
        (Channel.WHATSAPP, "+525540003333", "documento_borroso_ilegible.jpg", "foto"),
        (Channel.WHATSAPP, "+525540004444", "ine_cliente.jpg", "aqui esta mi INE"),
        (Channel.EMAIL, "remitente3@correo.com", "recibo_luz.pdf", "comprobante de domicilio"),
        (Channel.WHATSAPP, "+525540005555", "documento.pdf", "buenas"),
    ]
    with db_session(user_label="seed") as db:
        for ch, sender, fn, txt in huerfanos:
            orphan_service.crear_huerfano(
                db, content=b"%PDF-1.4 orphan", file_name=fn,
                mime_type="application/pdf", channel=ch, sender=sender, message_text=txt,
            )
    print(f"  + {len(huerfanos)} documentos huerfanos")

    _print_summary()


def _print_summary() -> None:
    with engine.connect() as c:
        print("\n=== Resumen en la BD ===")
        rows = c.execute(text(
            "SELECT s.label_es, count(cf.id) FROM cat_case_status s "
            "LEFT JOIN case_file cf ON cf.status_code = s.code AND cf.active_flag = 1 "
            "GROUP BY s.label_es, s.sort_order ORDER BY s.sort_order"
        )).all()
        for label, n in rows:
            print(f"  {label:22s} {n}")
        docs = c.execute(text("SELECT count(*) FROM document WHERE active_flag=1")).scalar()
        orph = c.execute(text("SELECT count(*) FROM orphan_document WHERE status_code='PENDING'")).scalar()
        ev = c.execute(text("SELECT count(*) FROM case_event")).scalar()
        print(f"  {'documentos':22s} {docs}")
        print(f"  {'huerfanos pendientes':22s} {orph}")
        print(f"  {'eventos timeline':22s} {ev}")


def _reset() -> None:
    print("Borrando datos de negocio (catalogos y usuarios se conservan)...")
    with engine.begin() as c:
        c.execute(text(
            "TRUNCATE llm_query, case_event, next_step, internal_note, "
            "case_checklist_item, orphan_document, document, case_file "
            "RESTART IDENTITY CASCADE"
        ))


if __name__ == "__main__":
    if "--reset" in sys.argv:
        _reset()
    print("Sembrando datos de demo en Neon...")
    seed_demo()
    print("\nListo. Explora en http://127.0.0.1:4000/docs (login: admin@centur.com / admin123)")
