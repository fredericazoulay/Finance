import json

import pytest

import audit_mail
from audit_mail import (
    AuditMailConfigurationError,
    SMTPSettings,
    audit_recipient_from_environment,
    send_audit_email,
    smtp_settings_from_environment,
)


class FakeSMTP:
    def __init__(self, *args, **kwargs):
        self.message = None
        self.started_tls = False
        self.login_details = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def starttls(self, **kwargs):
        self.started_tls = True

    def login(self, username, password):
        self.login_details = (username, password)

    def send_message(self, message):
        self.message = message


def test_smtp_configuration_uses_environment_and_audit_default(monkeypatch):
    monkeypatch.setenv("AUDIT_SMTP_HOST", "smtp.example.test")
    monkeypatch.setenv("AUDIT_EMAIL_FROM", "pricer@example.test")
    monkeypatch.delenv("AUDIT_EMAIL_TO", raising=False)
    monkeypatch.setenv("AUDIT_SMTP_PORT", "587")
    monkeypatch.setenv("AUDIT_SMTP_USER", "pricer")
    monkeypatch.setenv("AUDIT_SMTP_PASSWORD", "test-password")
    monkeypatch.setenv("AUDIT_SMTP_STARTTLS", "true")

    settings = smtp_settings_from_environment()

    assert settings.host == "smtp.example.test"
    assert settings.recipient == "audit@cdc.hackathon"
    assert settings.use_starttls
    assert settings.password == "test-password"


def test_smtp_configuration_rejects_missing_host(monkeypatch):
    monkeypatch.delenv("AUDIT_SMTP_HOST", raising=False)
    monkeypatch.setenv("AUDIT_EMAIL_FROM", "pricer@example.test")

    with pytest.raises(AuditMailConfigurationError, match="AUDIT_SMTP_HOST"):
        smtp_settings_from_environment()


def test_audit_recipient_reads_configured_destination(monkeypatch):
    monkeypatch.setattr(audit_mail, "load_local_environment", lambda: None)
    monkeypatch.setenv("AUDIT_EMAIL_TO", "audit-team@example.test")

    assert audit_recipient_from_environment() == "audit-team@example.test"


def test_send_audit_email_requires_explicit_smtp_and_attaches_json(monkeypatch):
    fake_server = FakeSMTP()
    monkeypatch.setattr(audit_mail.smtplib, "SMTP", lambda *args, **kwargs: fake_server)
    settings = SMTPSettings(
        host="smtp.example.test",
        port=587,
        sender="pricer@example.test",
        recipient="audit@example.test",
        username="pricer",
        password="test-password",
        use_starttls=True,
    )

    send_audit_email({"status": "demo"}, settings)

    assert fake_server.started_tls
    assert fake_server.login_details == ("pricer", "test-password")
    attachment = fake_server.message.get_payload()[1]
    assert json.loads(attachment.get_payload(decode=True)) == {
        "status": "demo"
    }
