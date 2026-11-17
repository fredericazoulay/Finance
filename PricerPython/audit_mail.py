"""Envoi explicite d'un rapport de sélection vers la boîte d'audit."""

from __future__ import annotations

import json
import os
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Any

from database import DatabaseConfigurationError, load_local_environment


DEFAULT_AUDIT_RECIPIENT = "audit@cdc.hackathon"


class AuditMailConfigurationError(RuntimeError):
    """Configuration SMTP absente ou incohérente."""


@dataclass(frozen=True)
class SMTPSettings:
    host: str
    port: int
    sender: str
    recipient: str
    username: str
    password: str
    use_starttls: bool


def smtp_settings_from_environment() -> SMTPSettings:
    try:
        load_local_environment()
    except DatabaseConfigurationError as exc:
        raise AuditMailConfigurationError(str(exc)) from exc
    host = os.environ.get("AUDIT_SMTP_HOST", "").strip()
    sender = os.environ.get("AUDIT_EMAIL_FROM", "").strip()
    recipient = (
        os.environ.get("AUDIT_EMAIL_TO", "").strip()
        or DEFAULT_AUDIT_RECIPIENT
    )
    if not host or not sender or not recipient:
        raise AuditMailConfigurationError(
            "Configurez AUDIT_SMTP_HOST et AUDIT_EMAIL_FROM."
        )
    try:
        port = int(os.environ.get("AUDIT_SMTP_PORT", "587"))
    except ValueError as exc:
        raise AuditMailConfigurationError(
            "AUDIT_SMTP_PORT doit être un entier."
        ) from exc
    if not 1 <= port <= 65535:
        raise AuditMailConfigurationError(
            "AUDIT_SMTP_PORT doit être compris entre 1 et 65535."
        )

    username = os.environ.get("AUDIT_SMTP_USER", "").strip()
    password = os.environ.get("AUDIT_SMTP_PASSWORD", "")
    if bool(username) != bool(password):
        raise AuditMailConfigurationError(
            "AUDIT_SMTP_USER et AUDIT_SMTP_PASSWORD doivent être configurés ensemble."
        )
    use_starttls = (
        os.environ.get("AUDIT_SMTP_STARTTLS", "true").strip().casefold()
        in {"true", "1", "yes"}
    )
    if username and not use_starttls and port != 465:
        raise AuditMailConfigurationError(
            "L'authentification SMTP exige STARTTLS ou le port SSL 465."
        )
    return SMTPSettings(
        host,
        port,
        sender,
        recipient,
        username,
        password,
        use_starttls,
    )


def audit_recipient_from_environment() -> str:
    try:
        load_local_environment()
    except DatabaseConfigurationError as exc:
        raise AuditMailConfigurationError(str(exc)) from exc
    return (
        os.environ.get("AUDIT_EMAIL_TO", "").strip()
        or DEFAULT_AUDIT_RECIPIENT
    )


def send_audit_email(
    report: dict[str, Any], settings: SMTPSettings
) -> None:
    """Envoie le rapport seulement après une action explicite de l'utilisateur."""
    serialized_report = json.dumps(
        report, ensure_ascii=False, indent=2, default=str, allow_nan=False
    )
    message = EmailMessage()
    message["Subject"] = "Finance Pricer — rapport de contrôle du panel"
    message["From"] = settings.sender
    message["To"] = settings.recipient
    message.set_content(
        "Rapport de sélection des obligations comparables en pièce jointe. "
        "Les données synthétiques ou non datées ne constituent pas une cotation."
    )
    message.add_attachment(
        serialized_report.encode("utf-8"),
        maintype="application",
        subtype="json",
        filename="rapport_panel.json",
    )

    if settings.port == 465:
        with smtplib.SMTP_SSL(
            settings.host,
            settings.port,
            timeout=15,
            context=ssl.create_default_context(),
        ) as server:
            _send_message(server, message, settings)
        return

    with smtplib.SMTP(settings.host, settings.port, timeout=15) as server:
        if settings.use_starttls:
            server.starttls(context=ssl.create_default_context())
        _send_message(server, message, settings)


def _send_message(
    server: smtplib.SMTP, message: EmailMessage, settings: SMTPSettings
) -> None:
    if settings.username:
        server.login(settings.username, settings.password)
    server.send_message(message)
