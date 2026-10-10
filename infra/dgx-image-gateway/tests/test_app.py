import base64
import os
import sys
import uuid

import httpx
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import app as gateway  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
PNG_B64 = base64.b64encode(PNG).decode()
JOB = str(uuid.uuid4())
AUTH = {"Authorization": "Bearer cle-passerelle"}
# Valeurs réelles, relevées avant que la fixture n'accélère l'interrogation.
REAL_POLL = (gateway.INITIAL_POLL_S, gateway.MAX_POLL_S, gateway.JOB_TIMEOUT_S)


@pytest.fixture(autouse=True)
def configuration(monkeypatch):
    monkeypatch.setenv("SIDECAR_BASE_URL", "http://sidecar.test")
    monkeypatch.setenv("SIDECAR_SECRET", "secret-sidecar")
    monkeypatch.setenv("GATEWAY_API_KEY", "cle-passerelle")
    monkeypatch.setattr(gateway, "INITIAL_POLL_S", 0.0)
    monkeypatch.setattr(gateway, "MAX_POLL_S", 0.0)


def client_with(handler):
    factory = lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler))  # noqa: E731
    return TestClient(gateway.create_app(factory))


def sidecar(states=("completed",), result=None, submit_status=202):
    seen = {"requests": []}
    remaining = list(states)

    def handler(request: httpx.Request) -> httpx.Response:
        seen["requests"].append(request)
        assert request.headers.get("X-Tamkin-Studio-Secret") == "secret-sidecar"
        if request.method == "POST":
            return httpx.Response(submit_status, json={"jobId": JOB})
        if request.url.path.endswith("/result"):
            return httpx.Response(200, json=result or {"data": [{"b64_json": PNG_B64}]})
        return httpx.Response(200, json={"status": remaining.pop(0) if len(remaining) > 1 else remaining[0]})

    return handler, seen


def test_traduit_la_requete_openai_en_workflow_asynchrone():
    handler, seen = sidecar(states=("queued", "running", "completed"))
    response = client_with(handler).post(
        "/v1/images/generations",
        headers=AUTH,
        json={"model": "flux-schnell", "prompt": "un schéma", "size": "1536x1024"},
    )
    assert response.status_code == 200
    assert response.json()["data"][0]["b64_json"] == PNG_B64
    submit = seen["requests"][0]
    assert submit.url.path == "/workflow/flux-schnell/txt2img/async"
    assert b'"size":"768x512"' in submit.content.replace(b" ", b"")
    assert any(r.url.path == f"/jobs/{JOB}/result" for r in seen["requests"])


def test_refuse_une_cle_invalide_sans_appeler_le_sidecar():
    handler, seen = sidecar()
    response = client_with(handler).post(
        "/v1/images/generations", headers={"Authorization": "Bearer mauvaise"}, json={"prompt": "x"}
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_api_key"
    assert seen["requests"] == []


def test_signale_un_secret_refuse_par_le_sidecar():
    handler, _ = sidecar(submit_status=401)
    response = client_with(handler).post("/v1/images/generations", headers=AUTH, json={"prompt": "x"})
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "sidecar_unauthorized"


def test_relaye_la_saturation_du_sidecar_en_429():
    handler, _ = sidecar(submit_status=429)
    response = client_with(handler).post("/v1/images/generations", headers=AUTH, json={"prompt": "x"})
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "sidecar_busy"


def test_job_en_echec():
    handler, _ = sidecar(states=("failed",))
    response = client_with(handler).post("/v1/images/generations", headers=AUTH, json={"prompt": "x"})
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "job_failed"


def test_refuse_un_resultat_qui_n_est_pas_un_png():
    handler, _ = sidecar(result={"data": [{"b64_json": base64.b64encode(b"pas un png").decode()}]})
    response = client_with(handler).post("/v1/images/generations", headers=AUTH, json={"prompt": "x"})
    assert response.status_code == 502


def test_refuse_n_different_de_un_et_les_modeles_inconnus():
    handler, seen = sidecar()
    client = client_with(handler)
    assert client.post("/v1/images/generations", headers=AUTH, json={"prompt": "x", "n": 2}).status_code == 400
    assert (
        client.post("/v1/images/generations", headers=AUTH, json={"prompt": "x", "model": "autre"}).status_code == 400
    )
    assert seen["requests"] == []


def test_non_configuree_repond_503(monkeypatch):
    monkeypatch.delenv("SIDECAR_SECRET")
    handler, _ = sidecar()
    response = client_with(handler).post("/v1/images/generations", headers=AUTH, json={"prompt": "x"})
    assert response.status_code == 503


def test_taille_ramenee_a_768_et_proportions_conservees():
    assert gateway.output_size("1024x1024") == "768x768"
    assert gateway.output_size("1920x1080") == "768x432"
    assert gateway.output_size("512x256") == "512x256"

def test_depasse_le_delai_total_en_504(monkeypatch):
    monkeypatch.setattr(gateway, "JOB_TIMEOUT_S", 0.0)
    handler, _ = sidecar(states=("running",))
    response = client_with(handler).post("/v1/images/generations", headers=AUTH, json={"prompt": "x"})
    assert response.status_code == 504
    assert response.json()["error"]["code"] == "job_timeout"


def test_constantes_alignees_sur_le_contrat_mesure():
    # Contrat Tamkin du 2026-10-10 : interrogation toutes les 5 s, délai total sous les 300 s du client.
    initial, maximum, total = REAL_POLL
    assert initial == 5.0 and maximum == 5.0
    assert 240.0 <= total < 300.0
