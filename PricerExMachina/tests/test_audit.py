from types import SimpleNamespace
from unittest.mock import patch

from app.audit import mailpit_inbox_summary, send_audit_email


def test_smtp_audit_reports_not_configured_without_connection_settings():
    with patch.dict("os.environ", {}, clear=True):
        result = send_audit_email({"obligation": {"isin": "TEST"}})
    assert result["status"] == "not_configured"


def test_smtp_audit_sends_structured_trace_when_configured():
    with patch.dict(
        "os.environ",
        {"SMTP_HOST": "localhost", "SMTP_PORT": "1025", "SMTP_FROM": "pricer@example.test"},
        clear=True,
    ), patch("app.audit.smtplib.SMTP") as smtp_type:
        smtp_type.return_value.__enter__.return_value.send_message.return_value = {}
        result = send_audit_email({"obligation": {"isin": "TEST"}})
    assert result["status"] == "sent"
    smtp_type.assert_called_once_with("localhost", 1025, timeout=10)


def test_mailpit_client_returns_only_message_metadata():
    mailbox = SimpleNamespace(
        total=1,
        unread=1,
        messages=[
            SimpleNamespace(
                subject="Bond pricing audit",
                to=[SimpleNamespace(address="audit@cdc.hackathon")],
                created="2026-11-23T12:00:00Z",
            )
        ],
    )
    with patch.dict("os.environ", {"MAILPIT_API_URL": "http://localhost:8025"}), patch(
        "mailpit.client.api.API"
    ) as api_type:
        api_type.return_value.get_messages.return_value = mailbox
        result = mailpit_inbox_summary()
    assert result["messages_total"] == 1
    assert result["recent_messages"][0]["recipients"] == ["audit@cdc.hackathon"]
    api_type.return_value.get_messages.assert_called_once_with(limit=20)
