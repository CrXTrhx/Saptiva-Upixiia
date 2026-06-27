"""Tests de integracion con TestClient (ejercita la app real contra Neon).

No requiere servidor corriendo. Crea sus propios datos de prueba (quedan en la BD
como expedientes de test). Cubre el flujo core + endpoints nuevos (editar, revertir
rechazo, catalogos).
"""
from __future__ import annotations

import time
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.seed import seed_admin


@pytest.fixture(scope="module")
def client() -> TestClient:
    seed_admin()  # garantiza admin@centur.com
    return TestClient(app)


@pytest.fixture(scope="module")
def auth(client: TestClient) -> dict:
    r = client.post("/api/auth/login", json={"email": "admin@centur.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _crear(client, auth, nombre="Test Persona", monto=700000, tipo="blindaje") -> dict:
    r = client.post("/api/expedientes", headers=auth, json={
        "clienteNombre": nombre, "clienteTelefono": "5550000000",
        "clienteCorreo": f"{uuid.uuid4().hex[:8]}@test.com",
        "montoEstimado": monto, "tipoOperacion": tipo,
    })
    assert r.status_code == 201, r.text
    return r.json()


def test_login_requiere_credenciales_validas(client):
    r = client.post("/api/auth/login", json={"email": "admin@centur.com", "password": "mala"})
    assert r.status_code == 401


def test_sin_token_es_401(client):
    assert client.get("/api/expedientes").status_code == 401


def test_crear_y_estado_inicial(client, auth):
    exp = _crear(client, auth)
    assert exp["estado"] == "CAPTURING"
    assert exp["codigo"].startswith("EXP-")


def test_editar_expediente(client, auth):
    exp = _crear(client, auth, nombre="Antes Edicion")
    r = client.patch(f"/api/expedientes/{exp['id']}", headers=auth, json={
        "clienteNombre": "Despues Edicion", "montoEstimado": 999999,
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
    r = client.post("/api/webhooks/whatsapp", json={
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
    r = client.post("/api/webhooks/whatsapp", json={
        "sender": "+525550000000", "text": "sin codigo",
        "fileName": file_name, "mimeType": "image/jpeg",
    })
    assert r.json()["status"] == "orphan", r.text
    return r.json()["orphanId"]


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
