"""SMTP audit delivery and Mailpit development diagnostics."""

from __future__ import annotations

from email.message import EmailMessage
from email.utils import make_msgid
import json
import os
import smtplib
import ssl
from typing import Any


def send_audit_email(pricing_result: dict[str, Any]) -> dict[str, str]:
    """Send an audit trace when SMTP is configured; otherwise report that it was not sent."""
    host = os.getenv("SMTP_HOST")
    sender = os.getenv("SMTP_FROM")
    if not host or not sender:
        return {
            "status": "not_configured",
            "reason": "SMTP_HOST and SMTP_FROM must be configured before audit email can be sent.",
        }

    recipient = os.getenv("AUDIT_TO", "audit@cdc.hackathon")
    try:
        port = int(os.getenv("SMTP_PORT", "1025"))
    except ValueError as exc:
        raise RuntimeError("SMTP_PORT must be an integer") from exc

    message = EmailMessage()
    message["From"] = sender
    message["To"] = recipient
    message["Subject"] = f"Bond pricing audit: {pricing_result.get('obligation', {}).get('isin', 'unknown')}"
    message["Message-ID"] = make_msgid()
    message.set_content(json.dumps(pricing_result, ensure_ascii=False, indent=2, default=str))

    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    if bool(username) != bool(password):
        raise RuntimeError("SMTP_USERNAME and SMTP_PASSWORD must either both be set or both be empty")

    with smtplib.SMTP(host, port, timeout=10) as client:
        if os.getenv("SMTP_STARTTLS", "false").strip().casefold() == "true":
            client.starttls(context=ssl.create_default_context())
        if username and password:
            client.login(username, password)
        client.send_message(message)
    return {"status": "sent", "recipient": recipient, "message_id": str(message["Message-ID"])}


def mailpit_inbox_summary() -> dict[str, Any]:
    """Return bounded mailbox metadata from Mailpit; message bodies are never exposed."""
    base_url = os.getenv("MAILPIT_API_URL")
    if not base_url:
        return {"status": "not_configured", "messages_total": None, "recent_messages": []}
    try:
        from mailpit.client.api import API
    except ImportError as exc:
        raise RuntimeError("Install mailpit-api-client to inspect the configured Mailpit inbox") from exc

    messages = API(base_url.rstrip("/"), timeout=5).get_messages(limit=20)
    return {
        "status": "available",
        "messages_total": messages.total,
        "unread": messages.unread,
        "recent_messages": [
            {
                "subject": message.subject,
                "recipients": [contact.address for contact in message.to],
                "created": str(message.created),
            }
            for message in messages.messages
        ],
    }
