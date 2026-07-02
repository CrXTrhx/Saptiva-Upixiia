"""Scheduler en proceso para dev (sin dependencias externas).

En produccion los crons se disparan por Railway cron / Task Scheduler (ver jobs.py).
Para desarrollo, este script corre los 3 jobs en un intervalo fijo.

Uso:
    python -m app.crons.scheduler            # corre cada 24 h (y una vez al inicio)
    python -m app.crons.scheduler --once     # corre una sola vez y termina
    python -m app.crons.scheduler --interval 3600   # cada hora (segundos)
"""
from __future__ import annotations

import sys
import time
from datetime import datetime

from app.crons.jobs import (
    archivar_completados,
    inactividad,
    vencimiento_consumado,
    vencimiento_proximo,
)

_JOBS = (vencimiento_proximo, vencimiento_consumado, inactividad, archivar_completados)
_DEFAULT_INTERVAL = 24 * 60 * 60  # 24 h


def run_once() -> None:
    print(f"--- crons @ {datetime.now().isoformat(timespec='seconds')} ---")
    for job in _JOBS:
        try:
            job()
        except Exception as exc:  # un job no debe tumbar a los demas
            print(f"[scheduler] error en {job.__name__}: {exc}")


def main(argv: list[str]) -> int:
    if "--once" in argv:
        run_once()
        return 0
    interval = _DEFAULT_INTERVAL
    if "--interval" in argv:
        interval = int(argv[argv.index("--interval") + 1])
    print(f"[scheduler] corriendo cada {interval}s (Ctrl+C para salir)")
    while True:
        run_once()
        time.sleep(interval)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
