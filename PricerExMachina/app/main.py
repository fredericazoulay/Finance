"""Small standard-library HTTP application for bond pricing."""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from typing import Any

from .agent import explain
from .pricing import RequestError, price_request
from .repository import PostgresRepository


def _json_bytes(payload: Any) -> bytes:
    return json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    repository = PostgresRepository()

    def _send_json(self, status: int, payload: Any) -> None:
        body = _json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send_json(200, {"status": "UP", "service": "PricerExMachina", "database_configured": bool(self.repository.database_url)})
        else:
            self._send_json(404, {"error": "Not found"})

    def do_POST(self) -> None:
        if self.path not in ("/api/pricing", "/api/assistant"):
            self._send_json(404, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 1_000_000:
                raise RequestError("Request body must be between 1 byte and 1 MB")
            payload = json.loads(self.rfile.read(length))
            if self.path == "/api/pricing":
                result = price_request(payload, self.repository)
                self._send_json(200, result)
                return
            question = payload.get("question") if isinstance(payload, dict) else None
            pricing_result = payload.get("pricing_result") if isinstance(payload, dict) else None
            if not isinstance(question, str) or not question.strip() or not isinstance(pricing_result, dict):
                raise RequestError("question and a deterministic pricing_result object are required")
            self._send_json(200, {"explanation": explain(question, pricing_result)})
        except RequestError as exc:
            self._send_json(400, {"error": str(exc)})
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Request body must be valid JSON"})
        except RuntimeError as exc:
            self._send_json(503, {"error": str(exc)})
        except Exception:
            # Avoid leaking database URLs, SQL details, or provider internals.
            self._send_json(503, {"error": "Pricing data source or optional integration is unavailable; check service configuration."})

    def log_message(self, format: str, *args: Any) -> None:
        # Avoid writing request content or credentials into routine logs.
        return


def main() -> None:
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8080"))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"PricerExMachina listening on http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
