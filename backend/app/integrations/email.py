"""Correo entrante/saliente — STUB. La integracion real se conecta despues."""
from __future__ import annotations


def verify_webhook_signature(secret: str, signature: str | None, body: bytes) -> bool:
    return True


def send_email(to: str, subject: str, body: str) -> None:
    print(f"[email-stub] -> {to} | {subject}: {body}")
