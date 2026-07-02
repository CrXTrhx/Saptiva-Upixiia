"""Configuracion central (lee variables de entorno / .env)."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Entorno de ejecucion: "development" | "production". En production se
    # deshabilita la documentacion interactiva (/docs, /redoc, /openapi.json).
    environment: str = "development"

    # Base de datos
    database_url: str = "postgresql://localhost/neondb"

    # Auth
    jwt_secret: str = "dev-secret-change-me"
    jwt_expire_minutes: int = 480
    jwt_algorithm: str = "HS256"
    admin_email: str = "admin@centur.com"
    admin_password: str = "admin123"
    admin_name: str = "Administrador"

    # URL publica del backend (para construir archivoUrl de storage local)
    api_public_url: str = "http://localhost:4000"

    # CORS
    cors_origins: str = "http://localhost:3000"

    # Datos del sistema (instrucciones al cliente)
    system_whatsapp: str = "+52 55 0000 0000"
    system_email: str = "documentos@mg.digitalfoldr.com"

    # Storage
    storage_backend: str = "local"  # local | r2
    # Retencion (en dias) de archivos temporales en R2 antes de que el cron los borre.
    # reemplazos: versiones reemplazadas de 2+ niveles atras (conserva vigente + 1 anterior).
    # other: documentos clasificados OTHER y rechazados (basura que no es ninguno de los 4 tipos).
    retencion_reemplazos_dias: int = 7
    retencion_other_dias: int = 7
    # Auto-archivado: dias que un expediente COMPLETO permanece visible antes de que el
    # cron lo archive solo. El reloj corre desde completed_at.
    auto_archivar_dias: int = 15
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = ""
    r2_public_base_url: str = ""

    # Integraciones
    # Google Document AI: 1 clasificador (verifica el tipo) + 1 extractor por tipo.
    gcp_project_id: str = ""
    docai_location: str = "us"  # us | eu (Document AI no tiene region LATAM)
    docai_classifier_id: str = ""
    docai_extractor_official_id: str = ""   # INE / identificacion oficial
    docai_extractor_curp: str = ""
    docai_extractor_tax_status: str = ""    # Constancia de Situacion Fiscal
    docai_extractor_proof_address: str = ""  # Comprobante de domicilio
    # Ruta al JSON del service account; si se define, se exporta a la env var estandar.
    google_application_credentials: str = ""
    sinch_api_token: str = ""
    sinch_webhook_secret: str = ""
    email_webhook_secret: str = ""
    # Correo (Mailgun): envio saliente (confirmaciones) + recepcion de documentos.
    mailgun_api_key: str = ""             # Private API key de Mailgun
    mailgun_domain: str = ""              # mg.digitalfoldr.com
    mailgun_base_url: str = "https://api.mailgun.net"  # region EU: https://api.eu.mailgun.net
    mailgun_signing_key: str = ""         # HTTP webhook signing key (valida correos entrantes)
    mail_from: str = ""                   # "Upiixia <noreply@mg.digitalfoldr.com>"
    anthropic_api_key: str = ""
    llm_use_real: bool = False
    extraction_confidence_threshold: float = 70.0

    @property
    def sqlalchemy_url(self) -> str:
        """Normaliza el string de Neon al driver psycopg3 (sincrono)."""
        url = self.database_url
        if url.startswith("postgresql+"):
            return url
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://") :]
        if url.startswith("postgresql://"):
            return "postgresql+psycopg://" + url[len("postgresql://") :]
        return url

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
