#!/bin/sh
# Arranque del backend dentro del contenedor:
#   1) espera a que PostgreSQL responda
#   2) marca baseline + aplica migraciones Alembic (idempotente)
#   3) siembra el usuario admin
#   4) levanta la API con uvicorn
set -e

echo "[entrypoint] Esperando a PostgreSQL..."
python - <<'PY'
import time
import psycopg
from app.core.config import settings

# psycopg.connect no entiende el sufijo +psycopg del driver de SQLAlchemy.
dsn = settings.sqlalchemy_url.replace("+psycopg", "")
for intento in range(1, 61):
    try:
        psycopg.connect(dsn, connect_timeout=3).close()
        print("[entrypoint] Base de datos lista.")
        break
    except Exception as exc:  # noqa: BLE001
        print(f"[entrypoint] DB no disponible ({intento}/60): {exc}")
        time.sleep(2)
else:
    raise SystemExit("[entrypoint] La base de datos no respondio a tiempo.")
PY

echo "[entrypoint] Aplicando migraciones..."
python - <<'PY'
import subprocess
import sys

from sqlalchemy import create_engine, text

from app.core.config import settings

engine = create_engine(settings.sqlalchemy_url)
with engine.connect() as conn:
    ya_versionado = conn.execute(
        text("SELECT to_regclass('public.alembic_version')")
    ).scalar()

# Primera vez: el schema.sql ya creo las tablas, solo marcamos la baseline.
if not ya_versionado:
    print("[entrypoint] Marcando baseline 0001_baseline.")
    subprocess.run([sys.executable, "-m", "alembic", "stamp", "0001_baseline"], check=True)

subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True)
PY

echo "[entrypoint] Sembrando usuario admin..."
python -m app.seed || echo "[entrypoint] seed omitido (admin ya existe)."

# Render (y otros PaaS) inyectan el puerto via $PORT; en local cae a 4000.
APP_PORT="${PORT:-4000}"
echo "[entrypoint] Iniciando API en http://0.0.0.0:${APP_PORT}"
exec uvicorn app.main:app --host 0.0.0.0 --port "${APP_PORT}"
