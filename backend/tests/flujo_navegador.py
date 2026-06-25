"""Simula el flujo del navegador (lo que hacen los services del frontend)."""
import httpx

B = "http://localhost:4000/api"
c = httpx.Client(base_url=B, timeout=30, headers={"Origin": "http://localhost:3000"})

r = c.post("/auth/login", json={"email": "admin@centur.com", "password": "admin123"})
print("login:", r.status_code, "| token?", bool(r.json().get("token")))
c.headers["Authorization"] = f"Bearer {r.json()['token']}"

print("conteos:", c.get("/expedientes/conteos").json())
exps = c.get("/expedientes").json()
print("lista expedientes:", len(exps), "| primero estado:", exps[0]["estado"])

det = c.get(f"/expedientes/{exps[0]['id']}/detalle").json()
print("detalle: checklist", len(det["checklist"]), "docs", len(det["documentos"]),
      "| tipoOperacion", det["expediente"]["tipoOperacion"])
print("huerfanos count:", c.get("/huerfanos/count").json())
print("config:", c.get("/config").json())
