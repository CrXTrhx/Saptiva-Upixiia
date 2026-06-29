"""Vacia COMPLETAMENTE el bucket de Cloudflare R2 (borra TODOS los objetos).

Uso (desde backend/, con el .env que apunta a R2):
    python -m app.clean_r2          # muestra cuantos hay y pide confirmacion
    python -m app.clean_r2 --yes    # borra sin confirmacion

Pensado para dejar el storage limpio antes de una demo. Irreversible.
"""
from __future__ import annotations

import sys

from app.core.config import settings
from app.integrations import storage


def _contar() -> int:
    client = storage._r2_client()
    paginator = client.get_paginator("list_objects_v2")
    total = 0
    for page in paginator.paginate(Bucket=settings.r2_bucket):
        total += len(page.get("Contents", []))
    return total


def main() -> None:
    if settings.storage_backend != "r2":
        print(f"STORAGE_BACKEND={settings.storage_backend} (no es r2). Nada que hacer.")
        return

    total = _contar()
    print(f"Bucket R2: {settings.r2_bucket}")
    print(f"Objetos actuales: {total}")
    if total == 0:
        print("El bucket ya esta vacio.")
        return

    if "--yes" not in sys.argv:
        resp = input(f"Borrar los {total} objetos del bucket '{settings.r2_bucket}'? [escribe 'si']: ")
        if resp.strip().lower() not in ("si", "sí", "yes", "y"):
            print("Cancelado.")
            return

    borrados = storage.purge_all()
    print(f"Listo. Objetos borrados: {borrados}")


if __name__ == "__main__":
    main()
