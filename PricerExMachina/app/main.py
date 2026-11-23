"""FastAPI service for bond-comparable pricing."""

from __future__ import annotations

import logging
import os
import smtplib
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

from .agent import explain
from .audit import mailpit_inbox_summary, send_audit_email
from .importer import WorkbookValidationError, preview_market_workbook
from .pricing import RequestError, price_request
from .repository import PostgresRepository


load_dotenv()
logger = logging.getLogger(__name__)
MAX_WORKBOOK_BYTES = 10_000_000
XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def create_app(
    repository: Any | None = None,
    audit_sender: Any = send_audit_email,
    mailpit_summary: Any = mailpit_inbox_summary,
) -> FastAPI:
    application = FastAPI(title="PricerExMachina", version="0.1.0")
    application.state.repository = repository or PostgresRepository()

    @application.get("/health")
    def health() -> dict[str, Any]:
        data_repository = application.state.repository
        return {
            "status": "UP",
            "service": "PricerExMachina",
            "database_configured": bool(getattr(data_repository, "database_url", None)),
        }

    @application.post("/api/pricing")
    def pricing(payload: dict[str, Any]) -> dict[str, Any]:
        try:
            result = price_request(payload, application.state.repository)
        except RequestError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        try:
            audit_result = audit_sender(result)
        except (OSError, RuntimeError, smtplib.SMTPException):
            logger.exception("Could not deliver bond-pricing audit email")
            result["audit_status"] = "failed"
            result["audit_error"] = "Pricing completed, but audit email delivery failed."
        else:
            result["audit_status"] = audit_result["status"]
            if audit_result.get("reason"):
                result["audit_warning"] = audit_result["reason"]
            if audit_result.get("message_id"):
                result["audit_message_id"] = audit_result["message_id"]
        return result

    @application.post("/api/assistant")
    def assistant(payload: dict[str, Any]) -> dict[str, str]:
        question = payload.get("question")
        pricing_result = payload.get("pricing_result")
        if not isinstance(question, str) or not question.strip() or not isinstance(pricing_result, dict):
            raise HTTPException(
                status_code=400,
                detail="question and a deterministic pricing_result object are required",
            )
        try:
            return {"explanation": explain(question, pricing_result)}
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @application.post("/api/market-data/preview")
    async def market_data_preview(request: Request) -> dict[str, Any]:
        content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().casefold()
        if content_type not in (XLSX_CONTENT_TYPE, "application/octet-stream"):
            raise HTTPException(status_code=415, detail="Upload an .xlsx workbook as the raw request body")
        content_length = request.headers.get("content-length")
        if content_length and content_length.isdigit() and int(content_length) > MAX_WORKBOOK_BYTES:
            raise HTTPException(status_code=413, detail="Workbook exceeds the 10 MB limit")
        content = await request.body()
        if not content or len(content) > MAX_WORKBOOK_BYTES:
            raise HTTPException(status_code=413 if content else 400, detail="Workbook must be 1 byte to 10 MB")
        try:
            return preview_market_workbook(content)
        except WorkbookValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.get("/api/audit/mailpit")
    def audit_mailpit() -> dict[str, Any]:
        try:
            return mailpit_summary()
        except (RuntimeError, httpx.HTTPError) as exc:
            logger.exception("Could not inspect the Mailpit audit inbox")
            raise HTTPException(
                status_code=503,
                detail="Mailpit inbox is unavailable; check its URL and service status.",
            ) from exc

    return application


app = create_app()


def main() -> None:
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8080")),
        reload=False,
    )


if __name__ == "__main__":
    main()
