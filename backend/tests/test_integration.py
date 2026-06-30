"""Tests de integracion con TestClient (ejercita la app real contra Neon).

No requiere servidor corriendo. Crea sus propios datos de prueba (quedan en la BD
como expedientes de test). Cubre el flujo core + endpoints nuevos (editar, revertir
rechazo, catalogos).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.seed import seed_admin

# Secreto compartido de prueba para los webhooks (ahora exigen firma HMAC fail-closed).
_WH_SECRET = "test-webhook-secret"


@pytest.fixture(scope="module", autouse=True)
def _configurar_secretos_webhook():
    """Los webhooks validan la firma con estos secretos; los fijamos para las pruebas."""
    settings.sinch_webhook_secret = _WH_SECRET
    settings.email_webhook_secret = _WH_SECRET
    yield


def _post_whatsapp(client: TestClient, payload: dict, *, firmar: bool = True):
    """POST firmado a /webhooks/whatsapp: la firma es HMAC-SHA256 del cuerpo crudo."""
    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if firmar:
        headers["X-Sinch-Signature"] = hmac.new(
            _WH_SECRET.encode("utf-8"), body, hashlib.sha256
        ).hexdigest()
    return client.post("/api/webhooks/whatsapp", content=body, headers=headers)


@pytest.fixture(scope="module")
def client() -> TestClient:
    seed_admin()  # garantiza admin@centur.com
    return TestClient(app)


@pytest.fixture(scope="module")
def auth(client: TestClient) -> dict:
    r = client.post("/api/auth/login", json={"email": "admin@centur.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _crear(
    client,
    auth,
    nombre="Test Persona",
    monto=700000,
    tipo="blindaje",
    rfc: str | None = None,
) -> dict:
    # El RFC es la identidad canónica del cliente y es obligatorio desde la relación
    # cliente-expediente por RFC. Generamos uno válido y único para aislar cada prueba.
    cliente_rfc = rfc or f"TEST900101{uuid.uuid4().hex[:3].upper()}"
    r = client.post("/api/expedientes", headers=auth, json={
        "clienteNombre": nombre, "clienteTelefono": "5550000000",
        "clienteCorreo": f"{uuid.uuid4().hex[:8]}@test.com",
        "clienteRfc": cliente_rfc,
        "operaciones": [{"tipo": tipo, "monto": monto}],
    })
    assert r.status_code == 201, r.text
    return r.json()


def test_clientes_por_rfc_y_paginacion(client, auth):
    rfc = f"TEST900101{uuid.uuid4().hex[:3].upper()}"
    primero = _crear(client, auth, nombre="Cliente RFC", monto=100000, rfc=rfc)
    segundo = _crear(client, auth, nombre="Cliente RFC", monto=200000, rfc=rfc)

    clientes = client.get(
        "/api/clientes", headers=auth, params={"search": rfc}
    )
    assert clientes.status_code == 200, clientes.text
    assert len(clientes.json()) == 1
    assert clientes.json()[0]["id"] == rfc
    assert clientes.json()[0]["totalExpedientes"] == 2

    expedientes_cliente = client.get(
        f"/api/clientes/{rfc}/expedientes", headers=auth
    )
    assert expedientes_cliente.status_code == 200, expedientes_cliente.text
    assert {e["id"] for e in expedientes_cliente.json()} == {
        primero["id"],
        segundo["id"],
    }

    pagina = client.get(
        "/api/expedientes/pagina",
        headers=auth,
        params={"search": rfc, "limit": 1, "offset": 0},
    )
    assert pagina.status_code == 200, pagina.text
    assert pagina.json()["total"] == 2
    assert len(pagina.json()["items"]) == 1

    siguiente = client.get(
        "/api/expedientes/pagina",
        headers=auth,
        params={"search": rfc, "limit": 1, "offset": 1},
    )
    assert siguiente.status_code == 200, siguiente.text
    assert siguiente.json()["total"] == 2
    assert len(siguiente.json()["items"]) == 1
    assert pagina.json()["items"][0]["id"] != siguiente.json()["items"][0]["id"]


def test_login_requiere_credenciales_validas(client):
    r = client.post("/api/auth/login", json={"email": "admin@centur.com", "password": "mala"})
    assert r.status_code == 401


def test_sin_token_es_401(client):
    assert client.get("/api/expedientes").status_code == 401


def test_crear_y_estado_inicial(client, auth):
    exp = _crear(client, auth)
    assert exp["estado"] == "CAPTURING"
    assert exp["codigo"].startswith("EXP-")
    # Una venta de un tipo expone una sola operacion.
    assert len(exp["operaciones"]) == 1
    assert exp["operaciones"][0]["tipo"] == "ARMORING"


def test_crear_un_tipo_conserva_prefijo(client, auth):
    exp = _crear(client, auth, tipo="vehicle_sale", monto=500000)
    assert exp["tipoOperacion"] == "VEHICLE_SALE"
    assert "-VNT" in exp["codigo"]


def test_crear_mixto_genera_codigo_mix(client, auth):
    rfc = f"TEST900101{uuid.uuid4().hex[:3].upper()}"
    r = client.post("/api/expedientes", headers=auth, json={
        "clienteNombre": "Cliente Mixto", "clienteTelefono": "5550000000",
        "clienteCorreo": f"{uuid.uuid4().hex[:8]}@test.com",
        "clienteRfc": rfc,
        "operaciones": [
            {"tipo": "vehicle_sale", "monto": 300000},
            {"tipo": "blindaje", "monto": 150000},
        ],
    })
    assert r.status_code == 201, r.text
    exp = r.json()
    assert exp["tipoOperacion"] == "MIXED"
    assert "-MIX" in exp["codigo"]
    assert exp["montoEstimado"] == 450000  # suma de las lineas
    assert len(exp["operaciones"]) == 2

    det = client.get(f"/api/expedientes/{exp['id']}/detalle", headers=auth).json()
    # El checklist son los 4 documentos de identidad (no se duplica al combinar tipos).
    assert len(det["checklist"]) == 4
    assert len(det["expediente"]["operaciones"]) == 2


def test_editar_expediente(client, auth):
    exp = _crear(client, auth, nombre="Antes Edicion")
    r = client.patch(f"/api/expedientes/{exp['id']}", headers=auth, json={
        "clienteNombre": "Despues Edicion",
        "operaciones": [{"tipo": "blindaje", "monto": 999999}],
    })
    assert r.status_code == 200, r.text
    assert r.json()["clienteNombre"] == "Despues Edicion"
    det = client.get(f"/api/expedientes/{exp['id']}/detalle", headers=auth).json()
    assert det["expediente"]["montoEstimado"] == 999999
    assert any(e["tipo"] == "CASE_UPDATED" for e in det["historial"])


def _esperar_estado_doc(client, auth, exp_id, doc_id, timeout=15.0):
    """La subida manual deja el doc en PROCESSING y lo analiza en segundo plano.
    Reconsulta el detalle hasta que el documento sale de PROCESSING."""
    deadline = time.time() + timeout
    doc = None
    while time.time() < deadline:
        det = client.get(f"/api/expedientes/{exp_id}/detalle", headers=auth).json()
        doc = next((d for d in det["documentos"] if d["id"] == doc_id), None)
        if doc and doc["estado"] != "PROCESSING":
            return doc
        time.sleep(0.5)
    return doc


def test_rechazo_automatico_y_revertir(client, auth):
    exp = _crear(client, auth)
    files = {"file": ("comprobante_ilegible.jpg", b"x", "image/jpeg")}
    r = client.post(f"/api/expedientes/{exp['id']}/documentos", headers=auth,
                    data={"tipo": "PROOF_OF_ADDRESS"}, files=files)
    assert r.status_code == 201, r.text
    doc_id = r.json()["id"]
    # El analisis corre en segundo plano: el doc queda en PROCESSING y termina
    # rechazado por ilegible. Releemos el estado ya resuelto.
    doc = _esperar_estado_doc(client, auth, exp["id"], doc_id)
    assert doc and doc["estado"] == "REJECTED", doc
    # revertir el rechazo automatico
    r = client.patch(f"/api/documentos/{doc_id}/revertir-rechazo", headers=auth)
    assert r.status_code == 200 and r.json()["estado"] == "RECEIVED", r.text


def test_descartar_y_restaurar_documento(client, auth):
    exp = _crear(client, auth)
    eid = exp["id"]
    # Sube un documento ilegible -> el analisis automatico lo deja en REJECTED.
    files = {"file": ("comprobante_ilegible.jpg", b"x", "image/jpeg")}
    r = client.post(f"/api/expedientes/{eid}/documentos", headers=auth,
                    data={"tipo": "PROOF_OF_ADDRESS"}, files=files)
    assert r.status_code == 201, r.text
    doc_id = r.json()["id"]
    doc = _esperar_estado_doc(client, auth, eid, doc_id)
    assert doc and doc["estado"] == "REJECTED", doc

    # Descartar: sale de la lista activa y entra en "descartados".
    r = client.patch(f"/api/documentos/{doc_id}/descartar", headers=auth)
    assert r.status_code == 200 and r.json()["estado"] == "DISCARDED", r.text
    det = client.get(f"/api/expedientes/{eid}/detalle", headers=auth).json()
    assert all(d["id"] != doc_id for d in det["documentos"]), "no debe seguir en activos"
    assert any(d["id"] == doc_id for d in det["descartados"]), "debe estar en descartados"

    # Solo se descartan documentos rechazados: descartar de nuevo es conflicto.
    r = client.patch(f"/api/documentos/{doc_id}/descartar", headers=auth)
    assert r.status_code == 409, r.text

    # Restaurar: vuelve a REJECTED y reaparece en activos.
    r = client.patch(f"/api/documentos/{doc_id}/restaurar-descartado", headers=auth)
    assert r.status_code == 200 and r.json()["estado"] == "REJECTED", r.text
    det = client.get(f"/api/expedientes/{eid}/detalle", headers=auth).json()
    assert any(d["id"] == doc_id for d in det["documentos"]), "debe volver a activos"
    assert all(d["id"] != doc_id for d in det["descartados"]), "ya no en descartados"


def test_restaurar_descartado_reemplaza_documento_activo_del_mismo_tipo(client, auth):
    exp = _crear(client, auth)
    eid = exp["id"]

    # 1) Sube un INE ilegible -> queda REJECTED -> lo descarta.
    files = {"file": ("ine_ilegible.jpg", b"x", "image/jpeg")}
    r = client.post(f"/api/expedientes/{eid}/documentos", headers=auth,
                    data={"tipo": "OFFICIAL_ID"}, files=files)
    assert r.status_code == 201, r.text
    viejo_id = r.json()["id"]
    doc = _esperar_estado_doc(client, auth, eid, viejo_id)
    assert doc and doc["estado"] == "REJECTED", doc
    r = client.patch(f"/api/documentos/{viejo_id}/descartar", headers=auth)
    assert r.status_code == 200, r.text

    # 2) Mientras tanto, sube un INE nuevo y bueno -> queda activo (VALIDATED).
    files2 = {"file": ("ine.jpg", b"x", "image/jpeg")}
    r = client.post(f"/api/expedientes/{eid}/documentos", headers=auth,
                    data={"tipo": "OFFICIAL_ID"}, files=files2)
    assert r.status_code == 201, r.text
    nuevo_activo_id = r.json()["id"]
    doc2 = _esperar_estado_doc(client, auth, eid, nuevo_activo_id)
    assert doc2 and doc2["estado"] == "RECEIVED", doc2
    r = client.patch(f"/api/documentos/{nuevo_activo_id}/validar", headers=auth)
    assert r.status_code == 200 and r.json()["estado"] == "VALIDATED", r.text

    # 3) Restaurar el INE descartado: NO debe duplicar el tipo. El que estaba activo
    #    (nuevo_activo_id) debe pasar a REPLACED y quedar como "version anterior" del
    #    restaurado; el checklist solo debe tener UN documento OFFICIAL_ID activo.
    r = client.patch(f"/api/documentos/{viejo_id}/restaurar-descartado", headers=auth)
    assert r.status_code == 200 and r.json()["estado"] == "REJECTED", r.text

    det = client.get(f"/api/expedientes/{eid}/detalle", headers=auth).json()
    activos_ine = [d for d in det["documentos"] if d["tipo"] == "OFFICIAL_ID"]
    assert len(activos_ine) == 1, f"no debe duplicar el tipo: {activos_ine}"
    assert activos_ine[0]["id"] == viejo_id
    assert activos_ine[0]["estado"] == "REJECTED"
    assert activos_ine[0]["versionAnterior"] is not None
    assert activos_ine[0]["versionAnterior"]["id"] == nuevo_activo_id
    assert activos_ine[0]["versionAnterior"]["estado"] == "REPLACED"

    checklist_ine = next(c for c in det["checklist"] if c["tipo"] == "OFFICIAL_ID")
    assert checklist_ine["estado"] == "REJECTED"


def test_flujo_completo_y_llm(client, auth):
    exp = _crear(client, auth, monto=700000, tipo="blindaje")
    eid = exp["id"]
    for tipo, fn in [
        ("OFFICIAL_ID", "ine.jpg"), ("CURP", "curp.pdf"),
        ("TAX_STATUS_CERT", "constancia_fiscal.pdf"),
        ("PROOF_OF_ADDRESS", "comprobante_domicilio.pdf"),
    ]:
        files = {"file": (fn, b"x", "application/pdf")}
        rr = client.post(f"/api/expedientes/{eid}/documentos", headers=auth,
                         data={"tipo": tipo}, files=files)
        assert rr.status_code == 201, rr.text

    det = client.get(f"/api/expedientes/{eid}/detalle", headers=auth).json()
    for d in det["documentos"]:
        if d["estado"] == "RECEIVED":
            client.patch(f"/api/documentos/{d['id']}/validar", headers=auth)

    # LLM: blindaje 700k -> SAT si, efectivo no
    sat = client.post(f"/api/expedientes/{eid}/consulta-llm", headers=auth,
                      json={"pregunta": "Hay que avisar al SAT?"}).json()
    assert sat["respuesta"] == "si"
    efe = client.post(f"/api/expedientes/{eid}/consulta-llm", headers=auth,
                      json={"pregunta": "Se puede pagar en efectivo?"}).json()
    assert efe["respuesta"] == "no"

    r = client.patch(f"/api/expedientes/{eid}/completar", headers=auth)
    assert r.status_code == 200 and r.json()["estado"] == "COMPLETE", r.text


def test_huerfano_y_asignacion(client, auth):
    # llega por whatsapp sin codigo -> huerfano
    r = _post_whatsapp(client, {
        "sender": "+525551112233", "text": "sin codigo", "fileName": "ine_x.jpg",
        "mimeType": "image/jpeg",
    })
    assert r.json()["status"] == "orphan"
    lst = client.get("/api/huerfanos", headers=auth).json()
    orphan_id = lst[0]["id"]
    exp = _crear(client, auth)
    r = client.post(f"/api/huerfanos/{orphan_id}/asignar", headers=auth,
                    json={"expedienteId": exp["id"], "tipo": "OFFICIAL_ID"})
    assert r.status_code == 201, r.text


def _huerfano_whatsapp(client, file_name: str) -> str:
    """Crea un huerfano por WhatsApp (sin codigo) y devuelve su id."""
    r = _post_whatsapp(client, {
        "sender": "+525550000000", "text": "sin codigo",
        "fileName": file_name, "mimeType": "image/jpeg",
    })
    assert r.json()["status"] == "orphan", r.text
    return r.json()["orphanId"]


def test_webhook_sin_firma_es_401(client):
    # Sin la cabecera de firma HMAC el webhook se rechaza (fail-closed).
    r = _post_whatsapp(
        client,
        {"sender": "+525550000000", "text": "EXP-2026-BLN00001-AAAA"},
        firmar=False,
    )
    assert r.status_code == 401, r.text


def test_webhook_firma_invalida_es_401(client):
    body = json.dumps({"sender": "x", "text": "hola"}).encode("utf-8")
    r = client.post(
        "/api/webhooks/whatsapp",
        content=body,
        headers={"Content-Type": "application/json", "X-Sinch-Signature": "deadbeef"},
    )
    assert r.status_code == 401, r.text


def test_documento_entrante_reemplaza_card_del_mismo_tipo(client, auth):
    """Al asignar un 2o documento del mismo tipo, el entrante se vuelve la UNICA
    card activa y el anterior (aunque este validado) pasa al historico como
    versionAnterior. Cubre el caso del huerfano que antes dejaba 2 cards (p. ej.
    2 INEs) cuando el entrante se auto-rechazaba."""
    exp = _crear(client, auth, nombre="Reemplazo Card")
    eid = exp["id"]
    suf = uuid.uuid4().hex[:6]

    # 1a INE: huerfano -> asignar (RECEIVED) -> validar (VALIDATED)
    o1 = _huerfano_whatsapp(client, f"ine_buena_{suf}.jpg")
    r = client.post(f"/api/huerfanos/{o1}/asignar", headers=auth,
                    json={"expedienteId": eid, "tipo": "OFFICIAL_ID"})
    assert r.status_code == 201 and r.json()["estado"] == "RECEIVED", r.text
    doc1 = r.json()["id"]
    rv = client.patch(f"/api/documentos/{doc1}/validar", headers=auth)
    assert rv.status_code == 200 and rv.json()["estado"] == "VALIDATED", rv.text

    # 2a INE: llega ilegible (se auto-rechaza) y se asigna al MISMO expediente
    o2 = _huerfano_whatsapp(client, f"ine_ilegible_{suf}.jpg")
    r = client.post(f"/api/huerfanos/{o2}/asignar", headers=auth,
                    json={"expedienteId": eid, "tipo": "OFFICIAL_ID"})
    assert r.status_code == 201 and r.json()["estado"] == "REJECTED", r.text
    doc2 = r.json()["id"]

    # Una sola card activa de OFFICIAL_ID; la previa validada quedo en el rastro.
    det = client.get(f"/api/expedientes/{eid}/detalle", headers=auth).json()
    ine_cards = [d for d in det["documentos"] if d["tipo"] == "OFFICIAL_ID"]
    assert len(ine_cards) == 1, [d["id"] for d in ine_cards]
    card = ine_cards[0]
    assert card["id"] == doc2, "el documento entrante debe ser la card activa"
    assert card["versionAnterior"] and card["versionAnterior"]["id"] == doc1, \
        "la version validada anterior debe quedar como versionAnterior"
    item = next(c for c in det["checklist"] if c["tipo"] == "OFFICIAL_ID")
    assert item["documentoId"] == doc2, "el checklist debe apuntar al documento activo"


def test_cancelar_con_motivo(client, auth):
    exp = _crear(client, auth)
    r = client.patch(f"/api/expedientes/{exp['id']}/cancelar", headers=auth,
                     json={"motivo": "cliente desistio"})
    assert r.status_code == 200 and r.json()["estado"] == "CANCELLED"


def test_catalogos(client, auth):
    r = client.get("/api/catalogos", headers=auth)
    assert r.status_code == 200, r.text
    data = r.json()
    assert {"estados", "tiposOperacion", "tiposDocumento"} <= set(data)
    armoring = [t for t in data["tiposOperacion"] if t["code"] == "ARMORING"]
    assert armoring and armoring[0]["avisoSat"] > 0


def test_conteos_y_lista(client, auth):
    conteos = client.get("/api/expedientes/conteos", headers=auth).json()
    assert "CAPTURING" in conteos
    lista = client.get("/api/expedientes?estado=CANCELLED", headers=auth).json()
    assert all(e["estado"] == "CANCELLED" for e in lista)
