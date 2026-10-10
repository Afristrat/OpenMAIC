"""Passerelle OpenAI Images devant le sidecar Studio de la DGX.

LiteLLM sait publier un service qui parle l'API OpenAI (`openai/<modèle>` en mode
`image_generation`). Le sidecar Studio, lui, expose un contrat asynchrone propriétaire :
soumission `POST /workflow/flux-schnell/txt2img/async`, interrogation `GET /jobs/<id>`,
résultat `GET /jobs/<id>/result`. Cette passerelle traduit l'un dans l'autre et garde le
secret du sidecar de son côté : ni LiteLLM ni Qalem n'ont à le connaître.

Variables d'environnement
  SIDECAR_BASE_URL   adresse du sidecar, ex. http://100.85.125.95:8189
  SIDECAR_SECRET     secret accepté par le sidecar (en-tête X-Tamkin-Studio-Secret)
  GATEWAY_API_KEY    clé que LiteLLM présente à cette passerelle (Authorization: Bearer)
  GATEWAY_MAX_PARALLEL   générations simultanées (défaut 1 : la mémoire GPU est partagée)
"""

from __future__ import annotations

import asyncio
import base64
import hmac
import os
import re
import time
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

WORKFLOW = "flux-schnell"
MAX_EDGE = 768
REQUEST_TIMEOUT_S = 10.0
# Mesuré par Tamkin le 2026-10-10 : une image prend 20 à 32 s sur un GPU partagé, à file unique.
# Interrogation toutes les 5 s, jamais en boucle serrée. Le délai total reste sous les 300 s du
# client HTTP de Qalem (undici) pour que la passerelle réponde avant lui.
JOB_TIMEOUT_S = 270.0
INITIAL_POLL_S = 5.0
MAX_POLL_S = 5.0
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
JOB_ID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)
SIZE = re.compile(r"^(\d{1,5})x(\d{1,5})$")


class ImageRequest(BaseModel):
    model: str = WORKFLOW
    prompt: str = Field(min_length=1, max_length=4000)
    n: int = 1
    size: str = "1024x1024"
    response_format: str = "b64_json"


def _settings() -> dict[str, str]:
    return {
        "base_url": os.environ.get("SIDECAR_BASE_URL", "").rstrip("/"),
        "secret": os.environ.get("SIDECAR_SECRET", ""),
        "api_key": os.environ.get("GATEWAY_API_KEY", ""),
    }


def output_size(size: str) -> str:
    """Ramène la taille demandée à 768 px maximum sur le grand côté, proportions conservées."""
    match = SIZE.match(size)
    if not match:
        raise HTTPException(400, f"Taille invalide : {size!r} (attendu LARGEURxHAUTEUR)")
    width, height = int(match.group(1)), int(match.group(2))
    if width < 1 or height < 1:
        raise HTTPException(400, "Les dimensions doivent être positives")
    scale = min(1.0, MAX_EDGE / max(width, height))
    return f"{max(1, round(width * scale))}x{max(1, round(height * scale))}"


def _openai_error(status: int, message: str, code: str | None = None) -> HTTPException:
    return HTTPException(status, detail={"error": {"message": message, "type": "gateway_error", "code": code}})


def create_app(client_factory: Any = None) -> FastAPI:
    app = FastAPI(title="Passerelle OpenAI Images, sidecar Studio DGX")
    semaphore = asyncio.Semaphore(max(1, int(os.environ.get("GATEWAY_MAX_PARALLEL", "1"))))
    make_client = client_factory or (lambda: httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S))

    @app.exception_handler(HTTPException)
    async def openai_style_errors(_request: Request, exc: HTTPException) -> JSONResponse:
        """Réponses d'erreur au format OpenAI, que LiteLLM sait relayer telles quelles."""
        content = exc.detail if isinstance(exc.detail, dict) else {
            "error": {"message": str(exc.detail), "type": "gateway_error", "code": None}
        }
        return JSONResponse(status_code=exc.status_code, content=content)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/v1/images/generations")
    async def generate(body: ImageRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
        cfg = _settings()
        if not cfg["base_url"] or not cfg["secret"] or not cfg["api_key"]:
            raise _openai_error(503, "Passerelle non configurée", "not_configured")
        token = (authorization or "").removeprefix("Bearer ").strip()
        if not hmac.compare_digest(token.encode(), cfg["api_key"].encode()):
            raise _openai_error(401, "Clé de passerelle invalide", "invalid_api_key")
        if body.n != 1:
            raise _openai_error(400, "Une seule image par requête (n=1)", "unsupported_n")
        if body.response_format != "b64_json":
            raise _openai_error(400, "Seul response_format=b64_json est pris en charge", "unsupported_format")
        if body.model != WORKFLOW:
            raise _openai_error(400, f"Modèle non pris en charge : {body.model}", "unsupported_model")

        headers = {"Accept": "application/json", "X-Tamkin-Studio-Secret": cfg["secret"]}
        size = output_size(body.size)

        # Un seul job à la fois par défaut : on ne force jamais la mémoire d'un GPU partagé.
        async with semaphore, make_client() as client:
            try:
                submitted = await client.post(
                    f"{cfg['base_url']}/workflow/{WORKFLOW}/txt2img/async",
                    headers={**headers, "Content-Type": "application/json"},
                    json={"prompt": body.prompt, "size": size},
                )
                if submitted.status_code in (401, 403):
                    raise _openai_error(502, "Le sidecar refuse le secret de la passerelle", "sidecar_unauthorized")
                if submitted.status_code == 429:
                    raise _openai_error(429, "Le sidecar est saturé, réessayer plus tard", "sidecar_busy")
                if submitted.status_code != 202:
                    raise _openai_error(502, f"Soumission refusée par le sidecar (HTTP {submitted.status_code})")
                job_id = submitted.json().get("jobId")
                if not isinstance(job_id, str) or not JOB_ID.match(job_id):
                    raise _openai_error(502, "Le sidecar n'a pas rendu d'identifiant de job valide")

                deadline = time.monotonic() + JOB_TIMEOUT_S
                interval = INITIAL_POLL_S
                while True:
                    job = await client.get(f"{cfg['base_url']}/jobs/{job_id}", headers=headers)
                    if job.status_code != 200:
                        raise _openai_error(502, f"Interrogation du job refusée (HTTP {job.status_code})")
                    state = job.json().get("status")
                    if state in ("failed", "expired"):
                        raise _openai_error(502, f"Le job d'image est {state}", f"job_{state}")
                    if state == "completed":
                        break
                    if state not in ("queued", "running"):
                        raise _openai_error(502, "État de job inconnu")
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise _openai_error(504, "La génération dépasse la limite de 270 secondes", "job_timeout")
                    await asyncio.sleep(min(interval, remaining))
                    interval = min(interval * 2, MAX_POLL_S)

                result = await client.get(f"{cfg['base_url']}/jobs/{job_id}/result", headers=headers)
                if result.status_code != 200:
                    raise _openai_error(502, f"Récupération du résultat refusée (HTTP {result.status_code})")
                data = result.json().get("data")
                encoded = data[0].get("b64_json") if isinstance(data, list) and data and isinstance(data[0], dict) else None
                if not isinstance(encoded, str) or not re.fullmatch(r"[A-Za-z0-9+/]+={0,2}", encoded):
                    raise _openai_error(502, "Le résultat ne contient pas d'image en base64 valide")
                if not base64.b64decode(encoded)[:8] == PNG_SIGNATURE:
                    raise _openai_error(502, "Le résultat n'est pas un PNG valide")
            except httpx.TimeoutException:
                raise _openai_error(504, "Le sidecar ne répond pas à temps", "sidecar_timeout") from None
            except httpx.TransportError:
                raise _openai_error(502, "Le sidecar est injoignable", "sidecar_unreachable") from None

        return {"created": int(time.time()), "data": [{"b64_json": encoded}]}

    return app


app = create_app()
