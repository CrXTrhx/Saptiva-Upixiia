"""Seed CURADO y MINIMO para la demo a inversionistas.

A diferencia de `seed_demo` (decenas de registros aleatorios = ruido), este crea
un set pequeno, limpio y creible: pocos clientes y UN expediente por cada estado
del sistema, para mostrar TODAS las funcionalidades de un vistazo y sin basura.

Construye los documentos DIRECTAMENTE (sube el archivo a R2 y fija el estado),
sin pasar por Document AI: asi los PDFs de demo quedan "recibidos/validados" de
forma determinista. Document AI rechazaria archivos sinteticos, por eso `seed_demo`
truena al llegar a estados validados bajo la config real (R2 + Document AI).

Uso (desde backend/, con el .env que apunta a Neon + R2):
    python -m app.seed_pitch            # agrega el set curado (asume BD/R2 limpios)
    python -m app.seed_pitch --reset    # vacia negocio + R2 y vuelve a sembrar

Credenciales: admin@centur.com / admin123
"""
from __future__ import annotations

import datetime as dt
import sys

from sqlalchemy import select, text

from app.core.codes import (
    CaseStatus,
    Channel,
    ChecklistStatus,
    DocStatus,
    DocType,
    EventType,
    LlmQuestionType,
    OrphanStatus,
)
from app.core.db import db_session, engine
from app.core.security import hash_password
from app.integrations import storage
from app.models import (
    AppUser,
    CaseChecklistItem,
    CaseFile,
    Document,
    OrphanDocument,
)
from app.modules.eventos import registrar_evento
from app.modules.expedientes import next_steps as ns
from app.modules.expedientes import service as exp_service
from app.modules.expedientes.schemas import CreateExpedienteRequest, OperacionItem
from app.modules.expedientes.state_machine import transition
from app.modules.llm import service as llm_service

ALL_TYPES = [
    DocType.OFFICIAL_ID,
    DocType.CURP,
    DocType.TAX_STATUS_CERT,
    DocType.PROOF_OF_ADDRESS,
]

_DOC_TITULO = {
    DocType.OFFICIAL_ID: "Identificacion oficial (INE)",
    DocType.CURP: "CURP",
    DocType.TAX_STATUS_CERT: "Constancia de Situacion Fiscal",
    DocType.PROOF_OF_ADDRESS: "Comprobante de domicilio",
}
_DOC_FILE = {
    DocType.OFFICIAL_ID: "ine.pdf",
    DocType.CURP: "curp.pdf",
    DocType.TAX_STATUS_CERT: "constancia_fiscal.pdf",
    DocType.PROOF_OF_ADDRESS: "comprobante_domicilio.pdf",
}
_DOC_TO_CHECKLIST = {
    DocStatus.RECEIVED: ChecklistStatus.RECEIVED,
    DocStatus.VALIDATED: ChecklistStatus.VALIDATED,
    DocStatus.EXPIRED: ChecklistStatus.EXPIRED,
    DocStatus.REJECTED: ChecklistStatus.REJECTED,
}

# Clientes de demo (datos ficticios pero coherentes; RFC/CURP con formato valido).
CLIENTES = {
    "mariana": {
        "nombre": "Mariana Robles Vega",
        "telefono": "5544102030",
        "correo": "mariana.robles@gmail.com",
        "rfc": "ROVM900312AB1",
        "curp": "ROVM900312MDFBGR08",
        "cp": "06700",
        "domicilio": "Av. Insurgentes Sur 1234, Col. Del Valle, CDMX",
    },
    "carlos": {
        "nombre": "Carlos Mendoza Tellez",
        "telefono": "5551207788",
        "correo": "carlos.mendoza@outlook.com",
        "rfc": "METC880714HM2",
        "curp": "METC880714HDFNLR03",
        "cp": "03100",
        "domicilio": "Calle Morelos 45, Col. Centro, Toluca",
    },
    "luis": {
        "nombre": "Luis Fernando Aguirre Ponce",
        "telefono": "5539887766",
        "correo": "lf.aguirre@gmail.com",
        "rfc": "AUPL920128QX4",
        "curp": "AUPL920128HDFGNS06",
        "cp": "11520",
        "domicilio": "Homero 1500, Col. Polanco, CDMX",
    },
    "sofia": {
        "nombre": "Sofia Herrera Lozano",
        "telefono": "5566554433",
        "correo": "sofia.herrera@gmail.com",
        "rfc": "HELS950612RT7",
        "curp": "HELS950612MDFRZF01",
        "cp": "44600",
        "domicilio": "Av. Chapultepec 890, Col. Americana, Guadalajara",
    },
    "diego": {
        "nombre": "Diego Castaneda Ruiz",
        "telefono": "5512349876",
        "correo": "diego.castaneda@hotmail.com",
        "rfc": "CARD910925MN8",
        "curp": "CARD910925HDFSXG09",
        "cp": "64000",
        "domicilio": "Padre Mier 200, Col. Centro, Monterrey",
    },
}


# --------------------------------------------------------------------------- #
# PDF minimo valido (1 pagina, con texto). Permite abrir el archivo en la demo.
# --------------------------------------------------------------------------- #
def _esc(s: str) -> str:
    return s.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def _pdf(titulo: str, lineas: list[str]) -> bytes:
    """Genera un PDF de una pagina con `titulo` + `lineas`, con xref correcto."""
    cmds = ["BT", "/F1 18 Tf", "72 720 Td", f"({_esc(titulo)}) Tj", "/F1 12 Tf"]
    for ln in lineas:
        cmds.append("0 -26 Td")
        cmds.append(f"({_esc(ln)}) Tj")
    cmds.append("ET")
    stream = "\n".join(cmds).encode("latin-1", "replace")

    objs = [
        b"<</Type/Catalog/Pages 2 0 R>>",
        b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
        b"<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]"
        b"/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>",
        b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
        b"<</Length %d>>\nstream\n%s\nendstream" % (len(stream), stream),
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets: list[int] = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref_pos = len(out)
    out += b"xref\n0 %d\n" % (len(objs) + 1)
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<</Size %d/Root 1 0 R>>\nstartxref\n%d\n%%%%EOF" % (
        len(objs) + 1,
        xref_pos,
    )
    return bytes(out)


# --------------------------------------------------------------------------- #
# Usuarios (staff interno)
# --------------------------------------------------------------------------- #
class _U:
    def __init__(self, uid, email, full_name):
        self.id, self.email, self.full_name = uid, email, full_name


def _ensure_users() -> list[_U]:
    perfiles = [
        ("admin@centur.com", "Administrador", "admin123"),
        ("ana@centur.com", "Ana Lopez", "demo123"),
        ("luis@centur.com", "Luis Perez", "demo123"),
    ]
    users: list[_U] = []
    with db_session(user_label="seed") as db:
        for email, name, pwd in perfiles:
            u = db.execute(
                select(AppUser).where(AppUser.email == email)
            ).scalar_one_or_none()
            if not u:
                u = AppUser(
                    email=email,
                    password_hash=hash_password(pwd),
                    full_name=name,
                    role_code="INTERNAL",
                )
                db.add(u)
                db.flush()
            users.append(_U(u.id, u.email, u.full_name))
    return users


# --------------------------------------------------------------------------- #
# Datos extraidos creibles por tipo
# --------------------------------------------------------------------------- #
def _extracted(dtype: str, cli: dict) -> dict:
    if dtype == DocType.OFFICIAL_ID:
        return {
            "nombre": cli["nombre"],
            "curp": cli["curp"],
            "vigencia": "2019-2029",
            "clave_elector": cli["rfc"][:6] + "0012345678",
        }
    if dtype == DocType.CURP:
        return {"curp": cli["curp"], "nombre": cli["nombre"]}
    if dtype == DocType.TAX_STATUS_CERT:
        return {
            "rfc": cli["rfc"],
            "nombre": cli["nombre"],
            "regimen": "Sueldos y Salarios",
            "codigo_postal": cli["cp"],
        }
    return {  # PROOF_OF_ADDRESS
        "domicilio": cli["domicilio"],
        "codigo_postal": cli["cp"],
        "fecha_emision": dt.date.today().replace(day=1).isoformat(),
    }


# --------------------------------------------------------------------------- #
# Helpers de construccion
# --------------------------------------------------------------------------- #
def _new_case(db, user, cli, monto, tipo) -> CaseFile:
    req = CreateExpedienteRequest(
        cliente_nombre=cli["nombre"],
        cliente_telefono=cli["telefono"],
        cliente_correo=cli["correo"],
        cliente_rfc=cli["rfc"],
        operaciones=[OperacionItem(tipo=tipo, monto=monto)],
    )
    case = exp_service.create_expediente(db, req, user)
    case.client_curp = cli["curp"]
    case.client_postal_code = cli["cp"]
    db.flush()
    return case


def _doc(db, case, user, cli, dtype, *, status, channel, issue_date=None, expiry_date=None):
    titulo = _DOC_TITULO[dtype]
    contenido = _pdf(
        titulo,
        [
            f"Cliente: {cli['nombre']}",
            f"Expediente: {case.code}",
            f"RFC: {cli['rfc']}",
            "Documento de DEMOSTRACION - datos ficticios.",
        ],
    )
    sender = cli["telefono"] if channel == Channel.WHATSAPP else cli["correo"]
    stored = storage.store(
        contenido, _DOC_FILE[dtype], "application/pdf", prefix=case.code, doc_type=dtype
    )
    doc = Document(
        case_file_id=case.id,
        declared_type_code=dtype,
        detected_type_code=dtype,
        file_url=stored.url,
        file_name=stored.file_name,
        mime_type="application/pdf",
        channel_code=channel,
        sender=sender,
        extracted_data=_extracted(dtype, cli),
        extraction_confidence=98.0,
        issue_date=issue_date,
        expiry_date=expiry_date,
        status_code=status,
    )
    if status == DocStatus.VALIDATED:
        doc.validated_by_id = user.id
        doc.validated_at = dt.datetime.now(dt.timezone.utc)
    db.add(doc)
    db.flush()

    item = db.execute(
        select(CaseChecklistItem).where(
            CaseChecklistItem.case_file_id == case.id,
            CaseChecklistItem.document_type_code == dtype,
            CaseChecklistItem.active_flag == 1,
        )
    ).scalar_one_or_none()
    if item:
        item.current_document_id = doc.id
        item.status_code = _DOC_TO_CHECKLIST[status]
        db.flush()

    registrar_evento(
        db, case.id, EventType.DOCUMENT_RECEIVED,
        f"Documento {titulo} recibido por {channel}",
        actor=user.email, actor_user_id=user.id,
    )
    if status == DocStatus.VALIDATED:
        registrar_evento(
            db, case.id, EventType.DOCUMENT_VALIDATED,
            f"Documento {titulo} validado por {user.full_name}",
            actor=user.email, actor_user_id=user.id,
        )
    return doc


def _nota(db, case, user, texto):
    exp_service.agregar_nota(db, case, texto, user)


def _backdate(db, case_id, days: int):
    if days <= 0:
        return
    for tbl, col in (
        ("case_file", "created_at"),
        ("case_event", "event_at"),
        ("document", "reception_at"),
    ):
        key = "id" if tbl == "case_file" else "case_file_id"
        db.execute(
            text(
                f"UPDATE {tbl} SET {col} = {col} - make_interval(days => :d) "
                f"WHERE {key} = :cid"
            ),
            {"d": days, "cid": str(case_id)},
        )


def _recibidos_validados(db, case, user, cli, status):
    """Crea los 4 documentos del checklist (todos RECEIVED o todos VALIDATED)."""
    # comprobante: vigencia 3 meses desde emision reciente
    hoy = dt.date.today()
    for dtype in ALL_TYPES:
        kw = {}
        if dtype == DocType.PROOF_OF_ADDRESS:
            kw = {"issue_date": hoy - dt.timedelta(days=20), "expiry_date": hoy + dt.timedelta(days=70)}
        elif dtype == DocType.OFFICIAL_ID:
            kw = {"expiry_date": dt.date(2029, 12, 31)}
        _doc(db, case, user, cli, dtype, status=status, channel=Channel.WHATSAPP, **kw)


# --------------------------------------------------------------------------- #
# Un expediente por estado
# --------------------------------------------------------------------------- #
def _build(estado, user, cli, monto, tipo, dias) -> str:
    with db_session(user_id=str(user.id), user_label=user.email) as db:
        case = _new_case(db, user, cli, monto, tipo)
        cid = str(case.id)

        if estado == CaseStatus.CAPTURING:
            pass

        elif estado == CaseStatus.RECEIVING:
            transition(db, case, CaseStatus.RECEIVING, actor=user.email,
                       actor_user_id=user.id, descripcion="Primer documento recibido")
            _doc(db, case, user, cli, DocType.OFFICIAL_ID, status=DocStatus.RECEIVED,
                 channel=Channel.WHATSAPP, expiry_date=dt.date(2029, 12, 31))
            _doc(db, case, user, cli, DocType.CURP, status=DocStatus.RECEIVED,
                 channel=Channel.WHATSAPP)
            _nota(db, case, user, "Cliente confirmo que enviara la constancia fiscal y el comprobante esta semana.")

        elif estado == CaseStatus.IN_VALIDATION:
            transition(db, case, CaseStatus.RECEIVING, actor=user.email,
                       actor_user_id=user.id, descripcion="Primer documento recibido")
            _recibidos_validados(db, case, user, cli, DocStatus.RECEIVED)
            transition(db, case, CaseStatus.IN_VALIDATION, actor=user.email,
                       actor_user_id=user.id, descripcion="Checklist completo, listo para validacion final")

        elif estado == CaseStatus.COMPLETE:
            transition(db, case, CaseStatus.RECEIVING, actor=user.email,
                       actor_user_id=user.id, descripcion="Primer documento recibido")
            _recibidos_validados(db, case, user, cli, DocStatus.VALIDATED)
            exp_service.marcar_completo(db, case, user)
            llm_service.consultar(db, case, "Hay que avisar al SAT por este monto?", user)
            llm_service.consultar(db, case, "Se puede recibir el pago en efectivo?", user)

        elif estado == CaseStatus.INCOMPLETE_EXPIRED:
            transition(db, case, CaseStatus.RECEIVING, actor=user.email,
                       actor_user_id=user.id, descripcion="Primer documento recibido")
            _recibidos_validados(db, case, user, cli, DocStatus.VALIDATED)
            transition(db, case, CaseStatus.IN_VALIDATION, actor=user.email,
                       actor_user_id=user.id, descripcion="Checklist completo, listo para validacion final")
            _vencer_comprobante(db, case, user)

        elif estado == CaseStatus.CANCELLED:
            transition(db, case, CaseStatus.RECEIVING, actor=user.email,
                       actor_user_id=user.id, descripcion="Primer documento recibido")
            _doc(db, case, user, cli, DocType.OFFICIAL_ID, status=DocStatus.RECEIVED,
                 channel=Channel.EMAIL, expiry_date=dt.date(2029, 12, 31))
            exp_service.cancelar(db, case, "El cliente desistio de la operacion", user)

        elif estado == CaseStatus.ARCHIVED:
            transition(db, case, CaseStatus.RECEIVING, actor=user.email,
                       actor_user_id=user.id, descripcion="Primer documento recibido")
            _recibidos_validados(db, case, user, cli, DocStatus.VALIDATED)
            exp_service.marcar_completo(db, case, user)
            exp_service.archivar(db, case, user)

        _backdate(db, cid, dias)
        db.refresh(case)
        ns.recompute(db, case)
        print(f"  {estado:20s} {case.code}  {cli['nombre']}")
        return cid


def _vencer_comprobante(db, case, user):
    """Marca el comprobante como vencido -> expediente INCOMPLETE_EXPIRED."""
    doc = db.execute(
        select(Document).where(
            Document.case_file_id == case.id,
            Document.detected_type_code == DocType.PROOF_OF_ADDRESS,
            Document.active_flag == 1,
        )
    ).scalars().first()
    if doc:
        doc.status_code = DocStatus.EXPIRED
        doc.expiry_date = dt.date.today() - dt.timedelta(days=5)
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
                     "Documento vencido, solicitar comprobante renovado", actor="cron")


# --------------------------------------------------------------------------- #
# Documentos huerfanos (cola de sin-codigo)
# --------------------------------------------------------------------------- #
def _orfano(db, *, channel, sender, file_name, mensaje, extracted=None,
            extracted_curp=None, extracted_rfc=None, suggested_type=None,
            suggested_case_id=None):
    contenido = _pdf("Documento sin codigo de expediente", [
        f"Remitente: {sender}", f"Canal: {channel}", "Demostracion - datos ficticios."])
    stored = storage.store(contenido, file_name, "application/pdf", prefix="huerfanos")
    orphan = OrphanDocument(
        file_url=stored.url,
        file_name=stored.file_name,
        mime_type="application/pdf",
        channel_code=channel,
        sender=sender,
        message_text=mensaje,
        extracted_data=extracted,
        extracted_curp=extracted_curp,
        extracted_rfc=extracted_rfc,
        suggested_document_type_code=suggested_type,
        suggested_case_file_id=suggested_case_id,
        status_code=OrphanStatus.PENDING,
    )
    db.add(orphan)
    db.flush()
    return orphan


def seed_pitch() -> None:
    users = _ensure_users()
    admin, ana, luis = users[0], users[1], users[2]

    print("Sembrando expedientes curados (uno por estado)...")
    # mariana y carlos quedan con DOS expedientes -> demuestra "un cliente, varios
    # expedientes" (relacion por RFC).
    ids: dict[str, str] = {}
    ids["capturing"] = _build(CaseStatus.CAPTURING, ana, CLIENTES["mariana"], 350000, "blindaje", 1)
    ids["receiving"] = _build(CaseStatus.RECEIVING, luis, CLIENTES["carlos"], 290000, "venta_vehiculo", 5)
    ids["in_validation"] = _build(CaseStatus.IN_VALIDATION, ana, CLIENTES["luis"], 500000, "blindaje", 2)
    ids["complete"] = _build(CaseStatus.COMPLETE, admin, CLIENTES["sofia"], 700000, "blindaje", 12)
    ids["expired"] = _build(CaseStatus.INCOMPLETE_EXPIRED, luis, CLIENTES["diego"], 420000, "venta_vehiculo", 30)
    ids["cancelled"] = _build(CaseStatus.CANCELLED, ana, CLIENTES["carlos"], 180000, "blindaje", 15)
    ids["archived"] = _build(CaseStatus.ARCHIVED, admin, CLIENTES["mariana"], 600000, "venta_vehiculo", 45)

    print("Sembrando documentos huerfanos...")
    with db_session(user_label="seed") as db:
        # 1) Huerfano que el sistema SUGIERE asignar al expediente de Carlos (match por CURP).
        _orfano(
            db, channel=Channel.WHATSAPP, sender=CLIENTES["carlos"]["telefono"],
            file_name="constancia_fiscal.pdf",
            mensaje="Buen dia, aqui esta mi constancia de situacion fiscal.",
            extracted=_extracted(DocType.TAX_STATUS_CERT, CLIENTES["carlos"]),
            extracted_curp=CLIENTES["carlos"]["curp"],
            extracted_rfc=CLIENTES["carlos"]["rfc"],
            suggested_type=DocType.TAX_STATUS_CERT,
            suggested_case_id=ids["receiving"],
        )
        # 2) INE sin remitente conocido (no hace match).
        _orfano(
            db, channel=Channel.WHATSAPP, sender="+525540009988",
            file_name="ine_frente.pdf",
            mensaje="Hola, les mando mi identificacion.",
        )
        # 3) Comprobante por correo, sin codigo (no hace match).
        _orfano(
            db, channel=Channel.EMAIL, sender="contacto.cliente@correo.com",
            file_name="recibo_cfe.pdf",
            mensaje="Adjunto mi comprobante de domicilio.",
        )

    _resumen()


def _resumen() -> None:
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
    print("Vaciando R2 (bucket de Cloudflare)...")
    borrados = storage.purge_all()
    print(f"  objetos R2 borrados: {borrados}")
    print("Vaciando datos de negocio en Neon (catalogos y usuarios se conservan)...")
    with engine.begin() as c:
        c.execute(text(
            "TRUNCATE llm_query, case_event, next_step, internal_note, "
            "case_checklist_item, orphan_document, document, case_file "
            "RESTART IDENTITY CASCADE"
        ))


if __name__ == "__main__":
    if "--reset" in sys.argv:
        _reset()
    seed_pitch()
    print("\nListo. Demo lista en http://localhost:3000  (login: admin@centur.com / admin123)")
