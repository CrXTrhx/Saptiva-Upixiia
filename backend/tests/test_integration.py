"""Tests de integracion con TestClient (ejercita la app real contra Neon).

No requiere servidor corriendo. Crea sus propios datos de prueba (quedan en la BD
como expedientes de test). Cubre el flujo core + endpoints nuevos (editar, revertir
rechazo, catalogos).
"""
from __future__ import annotations

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


def test_rechazo_automatico_y_revertir(client, auth):
    exp = _crear(client, auth)
    files = {"file": ("comprobante_ilegible.jpg", b"x", "image/jpeg")}
    r = client.post(f"/api/expedientes/{exp['id']}/documentos", headers=auth,
                    data={"tipo": "PROOF_OF_ADDRESS"}, files=files)
    assert r.status_code == 201 and r.json()["estado"] == "REJECTED", r.text
    doc_id = r.json()["id"]
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
