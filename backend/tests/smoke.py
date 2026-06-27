"""Smoke end-to-end contra un servidor corriendo (puerto 4000).

Recorre los pasos del guion de aceptacion del PRD (seccion 11). Uso:
    python -m tests.smoke
"""
from __future__ import annotations

import sys

import httpx

BASE = "http://localhost:4000/api"
ok = 0
fail = 0


def check(label: str, cond: bool, detail: str = "") -> None:
    global ok, fail
    mark = "OK " if cond else "XX "
    if cond:
        ok += 1
    else:
        fail += 1
    print(f"[{mark}] {label}" + (f" -- {detail}" if detail and not cond else ""))


def main() -> int:
    c = httpx.Client(base_url=BASE, timeout=30)

    # 1. Login
    r = c.post("/auth/login", json={"email": "admin@centur.com", "password": "admin123"})
    check("1. login", r.status_code == 200 and r.json().get("token"), r.text)
    token = r.json()["token"]
    c.headers["Authorization"] = f"Bearer {token}"

    # 2. Crear venta: Juan Perez, 700000, blindaje
    r = c.post("/expedientes", json={
        "clienteNombre": "Juan Perez", "clienteTelefono": "5550001111",
        "clienteCorreo": "juan@example.com", "montoEstimado": 700000,
        "tipoOperacion": "blindaje",
    })
    check("2. crear expediente", r.status_code == 201, r.text)
    exp = r.json()
    code, exp_id = exp["codigo"], exp["id"]
    check("2b. estado en_captura", exp["estado"] == "CAPTURING", exp.get("estado"))
    print(f"     codigo={code}")

    # 3. Conteos
    r = c.get("/expedientes/conteos")
    check("3. conteos", r.status_code == 200 and r.json().get("CAPTURING", 0) >= 1, r.text)

    # 4. INE por WhatsApp con codigo
    r = c.post("/webhooks/whatsapp", json={
        "sender": "+525551234567", "text": f"Hola, te mando mi INE {code}",
        "fileName": "ine_juan.jpg", "mimeType": "image/jpeg",
    })
    check("4. whatsapp INE asignado", r.status_code == 200 and r.json().get("status") == "assigned", r.text)

    # 5. CURP por correo con codigo
    r = c.post("/webhooks/email", json={
        "sender": "juan@example.com", "text": f"Asunto: CURP {code}",
        "fileName": "curp_juan.pdf", "mimeType": "application/pdf",
    })
    check("5. correo CURP asignado", r.status_code == 200 and r.json().get("status") == "assigned", r.text)

    # 6. Comprobante que la Document API no puede procesar -> rechazado
    files = {"file": ("comprobante_error.pdf", b"%PDF stub", "application/pdf")}
    r = c.post(f"/expedientes/{exp_id}/documentos", data={"tipo": "PROOF_OF_ADDRESS"}, files=files)
    check("6. comprobante rechazado auto", r.status_code == 201 and r.json().get("estado") == "REJECTED", r.text)
    bad_doc_id = r.json()["id"]

    # 7. Comprobante nuevo correcto (reemplazo)
    files = {"file": ("comprobante_domicilio.pdf", b"%PDF good", "application/pdf")}
    r = c.post(f"/documentos/{bad_doc_id}/reemplazar", files=files)
    check("7. reemplazo comprobante", r.status_code == 201 and r.json().get("estado") == "RECEIVED", r.text)
    check("7b. version anterior enlazada", r.json().get("versionAnterior") is not None, r.text)
    new_doc_id = r.json()["id"]

    # 7c. Restaurar la version anterior: el doc viejo vuelve a estar vigente.
    r = c.post(f"/documentos/{new_doc_id}/restaurar-version")
    restored = r.json()
    check(
        "7c. restaurar version anterior",
        r.status_code == 200
        and restored.get("id") == bad_doc_id
        and restored.get("estado") == "RECEIVED"
        and (restored.get("versionAnterior") or {}).get("id") == new_doc_id,
        r.text,
    )

    # 7d. Restaurar de nuevo (toggle): vuelve a quedar vigente el comprobante bueno.
    r = c.post(f"/documentos/{bad_doc_id}/restaurar-version")
    check(
        "7d. toggle de vuelta a la version nueva",
        r.status_code == 200 and r.json().get("id") == new_doc_id and r.json().get("estado") == "RECEIVED",
        r.text,
    )

    # 8. CSF desde el portal
    files = {"file": ("constancia_fiscal.pdf", b"%PDF csf", "application/pdf")}
    r = c.post(f"/expedientes/{exp_id}/documentos", data={"tipo": "TAX_STATUS_CERT"}, files=files)
    check("8. CSF subida", r.status_code == 201 and r.json().get("estado") == "RECEIVED", r.text)

    # 9. Detalle: checklist + next steps + historial
    r = c.get(f"/expedientes/{exp_id}/detalle")
    det = r.json()
    check("9. detalle ok", r.status_code == 200 and len(det["checklist"]) == 4, r.text)
    print(f"     next steps: {[s['texto'] for s in det['nextSteps']]}")

    # Validar los 4 documentos del checklist
    valid_docs = [d for d in det["documentos"] if d["estado"] == "RECEIVED"]
    for d in valid_docs:
        c.patch(f"/documentos/{d['id']}/validar")
    r = c.get(f"/expedientes/{exp_id}/detalle")
    det = r.json()
    all_validated = all(i["estado"] == "VALIDATED" for i in det["checklist"])
    check("9b. checklist validado", all_validated, str(det["checklist"]))
    print(f"     next steps tras validar: {[s['texto'] for s in det['nextSteps']]}")

    # 10. LLM SAT -> si
    r = c.post(f"/expedientes/{exp_id}/consulta-llm", json={"pregunta": "Hay que avisar al SAT?"})
    check("10. LLM SAT = si", r.status_code == 200 and r.json().get("respuesta") == "si", r.text)
    # 11. LLM efectivo -> no
    r = c.post(f"/expedientes/{exp_id}/consulta-llm", json={"pregunta": "Se puede pagar en efectivo?"})
    check("11. LLM efectivo = no", r.status_code == 200 and r.json().get("respuesta") == "no", r.text)

    # 12. Marcar completo
    r = c.patch(f"/expedientes/{exp_id}/completar")
    check("12. completar", r.status_code == 200 and r.json().get("estado") == "COMPLETE", r.text)

    # 13. Historial con timestamps
    r = c.get(f"/expedientes/{exp_id}/detalle")
    hist = r.json()["historial"]
    check("13. historial con eventos", len(hist) >= 6 and all(e.get("timestamp") for e in hist), str(len(hist)))

    # 14. Dashboard
    r = c.get("/expedientes")
    check("14. lista expedientes", r.status_code == 200 and len(r.json()) >= 1, r.text)

    # 15. Huerfano (whatsapp sin codigo) -> asignar a otro expediente
    r = c.post("/webhooks/whatsapp", json={
        "sender": "+525559999999", "text": "les mando un documento",
        "fileName": "documento.pdf", "mimeType": "application/pdf",
    })
    check("15. huerfano creado", r.status_code == 200 and r.json().get("status") == "orphan", r.text)
    r = c.get("/huerfanos/count")
    check("15b. conteo huerfanos", r.status_code == 200 and r.json().get("count", 0) >= 1, r.text)
    r = c.get("/huerfanos")
    orphan_id = r.json()[0]["id"]
    # crear un segundo expediente para asignarle el huerfano
    r2 = c.post("/expedientes", json={
        "clienteNombre": "Maria Lopez", "clienteTelefono": "5552223333",
        "clienteCorreo": "maria@example.com", "montoEstimado": 300000,
        "tipoOperacion": "blindaje",
    })
    exp2_id = r2.json()["id"]
    r = c.post(f"/huerfanos/{orphan_id}/asignar", json={"expedienteId": exp2_id, "tipo": "OFFICIAL_ID"})
    check("15c. huerfano asignado", r.status_code == 201, r.text)

    # 16. Cancelar un expediente con motivo
    r3 = c.post("/expedientes", json={
        "clienteNombre": "Pedro Ruiz", "clienteTelefono": "5554445555",
        "clienteCorreo": "pedro@example.com", "montoEstimado": 400000,
        "tipoOperacion": "blindaje",
    })
    exp3_id = r3.json()["id"]
    r = c.patch(f"/expedientes/{exp3_id}/cancelar", json={"motivo": "cliente desistio de la compra"})
    check("16. cancelar", r.status_code == 200 and r.json().get("estado") == "CANCELLED", r.text)

    print(f"\n=== {ok} OK, {fail} FAIL ===")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
