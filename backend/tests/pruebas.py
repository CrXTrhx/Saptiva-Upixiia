"""Corre las 10 pruebas esenciales del PRD y dice OK/FALLA en cada una.

Es la version "explicada" del smoke: cada prueba imprime QUE valida y su resultado.
Requiere el servidor corriendo en http://localhost:4000 y los archivos de
backend/sample_docs/.

Uso:
    python -m tests.pruebas
"""
from __future__ import annotations

import pathlib
import sys

import httpx

BASE = "http://localhost:4000/api"
DOCS = pathlib.Path(__file__).resolve().parents[1] / "sample_docs"

ok = 0
fail = 0


def resultado(n: int, titulo: str, cond: bool, detalle: str = "") -> None:
    global ok, fail
    if cond:
        ok += 1
        print(f"  PRUEBA {n:02d}  [ OK ]  {titulo}")
    else:
        fail += 1
        print(f"  PRUEBA {n:02d}  [FALLA]  {titulo}")
    if detalle:
        print(f"             -> {detalle}")


def archivo(nombre: str):
    data = (DOCS / nombre).read_bytes()
    mime = "image/jpeg" if nombre.endswith(".jpg") else "application/pdf"
    return {"file": (nombre, data, mime)}


def main() -> int:
    c = httpx.Client(base_url=BASE, timeout=30)

    print("\n========== 10 PRUEBAS ESENCIALES (PRD) ==========\n")

    # --- Preparacion: login ---
    r = c.post("/auth/login", json={"email": "admin@centur.com", "password": "admin123"})
    if r.status_code != 200:
        print("No se pudo hacer login. ?Esta el servidor corriendo en :4000?")
        return 1
    c.headers["Authorization"] = f"Bearer {r.json()['token']}"

    # --- PRUEBA 1: Dashboard (Flujo B) ---
    rc = c.get("/expedientes/conteos")
    rl = c.get("/expedientes")
    resultado(
        1, "Dashboard: conteos por estado + lista de expedientes",
        rc.status_code == 200 and rl.status_code == 200 and len(rl.json()) > 0,
        f"{sum(rc.json().values())} expedientes en total" if rc.status_code == 200 else rc.text,
    )

    # --- PRUEBA 2: Crear venta (Flujo A) + instrucciones ---
    r = c.post("/expedientes", json={
        "clienteNombre": "Prueba Automatizada", "clienteTelefono": "5551234567",
        "clienteCorreo": "prueba.auto@correo.com", "montoEstimado": 700000,
        "tipoOperacion": "blindaje",
    })
    e1 = r.json() if r.status_code == 201 else {}
    e1_id, e1_code = e1.get("id"), e1.get("codigo")
    instr = c.get(f"/expedientes/{e1_id}/instrucciones") if e1_id else None
    resultado(
        2, "Crear expediente + generar instrucciones para el cliente",
        r.status_code == 201 and e1.get("estado") == "CAPTURING" and instr.status_code == 200,
        f"codigo {e1_code}, estado CAPTURING",
    )

    # --- PRUEBA 3: Subir documento bueno (portal web) ---
    r = c.post(f"/expedientes/{e1_id}/documentos",
               data={"tipo": "OFFICIAL_ID"}, files=archivo("ine_juan.jpg"))
    resultado(
        3, "Subir INE desde el portal -> se recibe y se extraen datos",
        r.status_code == 201 and r.json().get("estado") == "RECEIVED",
        f"estado {r.json().get('estado')}, datos: {list((r.json().get('datosExtraidos') or {}).keys())}",
    )

    # --- PRUEBA 4: Rechazo automatico + revertir (PRD seccion 5) ---
    r = c.post(f"/expedientes/{e1_id}/documentos",
               data={"tipo": "PROOF_OF_ADDRESS"}, files=archivo("comprobante_ilegible.jpg"))
    rechazado = r.json()
    doc_rech = rechazado.get("id")
    cond_rech = r.status_code == 201 and rechazado.get("estado") == "REJECTED"
    rev = c.patch(f"/documentos/{doc_rech}/revertir-rechazo") if doc_rech else None
    cond_rev = rev is not None and rev.status_code == 200 and rev.json().get("estado") == "RECEIVED"
    resultado(
        4, "Comprobante ilegible -> rechazo automatico, luego se revierte",
        cond_rech and cond_rev,
        f"rechazo: {rechazado.get('motivoRechazo', {}).get('categoria')}, revertido a RECEIVED",
    )

    # --- PRUEBA 5: Detalle completo (Flujo C) ---
    r = c.get(f"/expedientes/{e1_id}/detalle")
    det = r.json() if r.status_code == 200 else {}
    resultado(
        5, "Detalle del expediente: checklist + documentos + nextSteps + historial",
        r.status_code == 200 and len(det.get("checklist", [])) == 4 and len(det.get("historial", [])) > 0,
        f"{len(det.get('documentos', []))} docs, {len(det.get('historial', []))} eventos, "
        f"nextSteps: {[s['texto'] for s in det.get('nextSteps', [])]}",
    )

    # --- PRUEBA 6: Recepcion por WhatsApp (con y sin codigo) ---
    e2 = c.post("/expedientes", json={
        "clienteNombre": "Cliente WhatsApp", "clienteTelefono": "5559990000",
        "clienteCorreo": "wa@correo.com", "montoEstimado": 300000, "tipoOperacion": "blindaje",
    }).json()
    asignado = c.post("/webhooks/whatsapp", json={
        "sender": "+525551112233", "text": f"Hola les mando mi INE {e2['codigo']}",
        "fileName": "ine_cliente.jpg",
    })
    huerfano = c.post("/webhooks/whatsapp", json={
        "sender": "+525554445566", "text": "buenas les mando un documento",
        "fileName": "documento.pdf",
    })
    resultado(
        6, "WhatsApp: con codigo -> al expediente; sin codigo -> a huerfanos",
        asignado.json().get("status") == "assigned" and huerfano.json().get("status") == "orphan",
        f"con codigo: {asignado.json().get('status')} | sin codigo: {huerfano.json().get('status')}",
    )

    # --- PRUEBA 7: Cola de huerfanos: listar + asignar ---
    lista_h = c.get("/huerfanos")
    e3 = c.post("/expedientes", json={
        "clienteNombre": "Destino Huerfano", "clienteTelefono": "5557778888",
        "clienteCorreo": "dest@correo.com", "montoEstimado": 200000, "tipoOperacion": "blindaje",
    }).json()
    asig = None
    if lista_h.status_code == 200 and lista_h.json():
        oid = lista_h.json()[0]["id"]
        asig = c.post(f"/huerfanos/{oid}/asignar",
                      json={"expedienteId": e3["id"], "tipo": "OFFICIAL_ID"})
    resultado(
        7, "Huerfanos: listar la cola y asignar uno a un expediente",
        lista_h.status_code == 200 and asig is not None and asig.status_code == 201,
        f"{len(lista_h.json())} huerfanos en cola",
    )

    # --- PRUEBA 8: Botones LLM (PRD seccion 7) ---
    sat = c.post(f"/expedientes/{e1_id}/consulta-llm", json={"pregunta": "Hay que avisar al SAT?"})
    efe = c.post(f"/expedientes/{e1_id}/consulta-llm", json={"pregunta": "Se puede pagar en efectivo?"})
    resultado(
        8, "LLM: $700K blindaje -> avisar SAT = SI, efectivo = NO",
        sat.json().get("respuesta") == "si" and efe.json().get("respuesta") == "no",
        f"SAT: {sat.json().get('respuesta')} | efectivo: {efe.json().get('respuesta')}",
    )

    # --- PRUEBA 9: Validar los 4 documentos y completar ---
    c.post(f"/expedientes/{e1_id}/documentos", data={"tipo": "CURP"}, files=archivo("curp_juan.pdf"))
    c.post(f"/expedientes/{e1_id}/documentos", data={"tipo": "TAX_STATUS_CERT"},
           files=archivo("constancia_fiscal_juan.pdf"))
    det = c.get(f"/expedientes/{e1_id}/detalle").json()
    for d in det["documentos"]:
        if d["estado"] == "RECEIVED":
            c.patch(f"/documentos/{d['id']}/validar")
    comp = c.patch(f"/expedientes/{e1_id}/completar")
    resultado(
        9, "Validar los 4 documentos del checklist y marcar COMPLETO",
        comp.status_code == 200 and comp.json().get("estado") == "COMPLETE",
        f"estado final: {comp.json().get('estado')}",
    )

    # --- PRUEBA 10: Cancelar con motivo + correr crons ---
    canc = c.patch(f"/expedientes/{e3['id']}/cancelar", json={"motivo": "cliente desistio de la compra"})
    crons_ok = True
    try:
        from app.crons.jobs import inactividad, vencimiento_consumado, vencimiento_proximo
        vencimiento_proximo(); vencimiento_consumado(); inactividad()
    except Exception as exc:  # noqa
        crons_ok = False
        print(f"             (cron error: {exc})")
    resultado(
        10, "Cancelar expediente con motivo + correr los 3 crons",
        canc.status_code == 200 and canc.json().get("estado") == "CANCELLED" and crons_ok,
        f"cancelado OK; crons ejecutados: {crons_ok}",
    )

    print(f"\n========== RESULTADO: {ok} OK, {fail} FALLA ==========\n")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
