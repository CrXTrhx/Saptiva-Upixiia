# Backend Saptiva AML — FastAPI + SQLAlchemy (psycopg3)
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencias del sistema: curl para el healthcheck. psycopg[binary] trae su
# propio libpq, asi que no hace falta compilar nada.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Instala dependencias primero para aprovechar la cache de capas.
COPY requirements.txt .
RUN pip install -r requirements.txt

# Codigo de la app.
COPY . .

# Normaliza saltos de linea y hace ejecutable el entrypoint (por si se clona en Windows).
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["./docker-entrypoint.sh"]
