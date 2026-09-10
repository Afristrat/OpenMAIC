"""Private, bounded AudioSeal service used only by the Qalem worker.

The wire protocol receives exactly eleven 16-bit messages.  Each message is
embedded in a two-second audio window; cycles repeat for longer media.  The
service never persists request audio and does not expose its model publicly.
"""

from __future__ import annotations

import asyncio
import hmac
import json
import os
import shutil
import subprocess
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

import numpy as np
import soundfile as sf
import torch
from audioseal import AudioSeal
from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse

SAMPLE_RATE = 16_000
SEGMENT_SECONDS = 2
SEGMENT_COUNT = 11
MAX_INPUT_BYTES = 150 * 1024 * 1024
MAX_SECONDS = int(os.environ.get("QALEM_AUDIOSEAL_MAX_SECONDS", "180"))
MAX_SECONDS = max(SEGMENT_COUNT * SEGMENT_SECONDS, min(MAX_SECONDS, 900))
DEVICE_NAME = os.environ.get("QALEM_AUDIOSEAL_DEVICE", "cpu")
REQUEST_LOCK = asyncio.Lock()


def require_token(authorization: Annotated[str | None, Header()] = None) -> None:
    expected = os.environ.get("QALEM_AUDIOSEAL_TOKEN")
    provided = authorization.removeprefix("Bearer ") if authorization else ""
    if not expected or not authorization or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


def message_bits(message: int) -> torch.Tensor:
    return torch.tensor(
        [(message >> shift) & 1 for shift in range(15, -1, -1)],
        dtype=torch.int64,
    ).unsqueeze(0)


def validate_messages(raw: str) -> list[int]:
    try:
        values = [int(value) for value in json.loads(raw)]
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid watermark messages") from None
    if len(values) != SEGMENT_COUNT:
        raise HTTPException(status_code=400, detail="Exactly eleven watermark messages are required")
    for index, value in enumerate(values):
        if value < 0 or value > 0xFFFF or value >> 12 != index:
            raise HTTPException(status_code=400, detail="Invalid composite watermark message")
    return values


def run_ffmpeg(args: list[str]) -> None:
    try:
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args],
            check=True,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=90,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        raise HTTPException(status_code=422, detail="Audio conversion failed") from error


def read_upload(upload: UploadFile, directory: Path) -> Path:
    source = directory / "source.bin"
    total = 0
    with source.open("wb") as output:
        while chunk := upload.file.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_INPUT_BYTES:
                raise HTTPException(status_code=413, detail="Audio source exceeds the allowed size")
            output.write(chunk)
    if total == 0:
        raise HTTPException(status_code=400, detail="Audio source is empty")
    return source


class Engine:
    def __init__(self) -> None:
        if DEVICE_NAME == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("QALEM_AUDIOSEAL_DEVICE=cuda but CUDA is unavailable")
        self.device = torch.device(DEVICE_NAME)
        self.generator = AudioSeal.load_generator("audioseal_wm_16bits").to(self.device).eval()
        self.detector = AudioSeal.load_detector("audioseal_detector_16bits").to(self.device).eval()

    def embed(self, waveform: torch.Tensor, messages: list[int]) -> torch.Tensor:
        window = SAMPLE_RATE * SEGMENT_SECONDS
        if waveform.shape[-1] < window * SEGMENT_COUNT:
            raise HTTPException(
                status_code=422,
                detail="Audio must contain at least one complete 22-second watermark cycle",
            )
        chunks: list[torch.Tensor] = []
        with torch.inference_mode():
            for start in range(0, waveform.shape[-1], window):
                chunk = waveform[..., start : start + window]
                if chunk.shape[-1] < window:
                    chunks.append(chunk)
                    continue
                message = message_bits(messages[(start // window) % SEGMENT_COUNT]).to(self.device)
                chunks.append(self.generator(chunk.to(self.device), message=message).cpu())
        return torch.cat(chunks, dim=-1)

    def detect_messages(self, waveform: torch.Tensor) -> list[dict[str, float | int]]:
        window = SAMPLE_RATE * SEGMENT_SECONDS
        decoded: list[dict[str, float | int]] = []
        with torch.inference_mode():
            for start in range(0, waveform.shape[-1] - window + 1, window // 2):
                chunk = waveform[..., start : start + window].to(self.device)
                probability, bits = self.detector.detect_watermark(chunk)
                confidence = float(probability.item())
                if confidence < 0.5:
                    continue
                value = 0
                for bit in bits[0].tolist():
                    value = (value << 1) | int(bit)
                decoded.append({"message": value, "confidence": confidence})
        return decoded


engine: Engine | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global engine
    engine = Engine()
    yield
    engine = None
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, object]:
    return {"ok": engine is not None, "model": "audioseal_wm_16bits", "maxSeconds": MAX_SECONDS}


def to_waveform(source: Path, directory: Path) -> torch.Tensor:
    wav_path = directory / "decoded.wav"
    run_ffmpeg(["-i", str(source), "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE), str(wav_path)])
    samples, sample_rate = sf.read(wav_path, dtype="float32", always_2d=False)
    if sample_rate != SAMPLE_RATE or samples.ndim != 1:
        raise HTTPException(status_code=422, detail="Audio normalization failed")
    if len(samples) > SAMPLE_RATE * MAX_SECONDS:
        raise HTTPException(status_code=413, detail="Audio duration exceeds the allowed limit")
    return torch.from_numpy(np.ascontiguousarray(samples)).unsqueeze(0).unsqueeze(0)


@app.post("/v1/watermark", dependencies=[Depends(require_token)])
async def watermark(
    source: Annotated[UploadFile, File()],
    messages: Annotated[str, Form()],
):
    if engine is None:
        raise HTTPException(status_code=503, detail="AudioSeal model is not ready")
    composite = validate_messages(messages)
    async with REQUEST_LOCK:
        with tempfile.TemporaryDirectory(prefix="qalem-audioseal-") as temporary:
            directory = Path(temporary)
            source_path = read_upload(source, directory)
            waveform = to_waveform(source_path, directory)
            marked = engine.embed(waveform, composite)
            wav_path = directory / "marked.wav"
            mp3_path = directory / "marked.mp3"
            sf.write(wav_path, marked.squeeze().numpy(), SAMPLE_RATE, subtype="PCM_16")
            run_ffmpeg(["-i", str(wav_path), "-c:a", "libmp3lame", "-b:a", "192k", str(mp3_path)])
            file_descriptor, response_name = tempfile.mkstemp(
                prefix="qalem-audioseal-response-", suffix=".mp3"
            )
            os.close(file_descriptor)
            delivery_path = Path(response_name)
            shutil.copyfile(mp3_path, delivery_path)
    background = BackgroundTasks()
    background.add_task(delivery_path.unlink, missing_ok=True)
    return FileResponse(
        delivery_path,
        media_type="audio/mpeg",
        filename="watermarked.mp3",
        headers={
            "X-Qalem-AudioSeal-Model": "audioseal_wm_16bits",
            "X-Qalem-AudioSeal-Segments": str(SEGMENT_COUNT),
            "Cache-Control": "no-store",
        },
        background=background,
    )


@app.post("/v1/detect", dependencies=[Depends(require_token)])
async def detect(source: Annotated[UploadFile, File()]) -> dict[str, list[dict[str, float | int]]]:
    """Private verification endpoint for the P2-C robustness harness."""
    if engine is None:
        raise HTTPException(status_code=503, detail="AudioSeal model is not ready")
    async with REQUEST_LOCK:
        with tempfile.TemporaryDirectory(prefix="qalem-audioseal-") as temporary:
            directory = Path(temporary)
            source_path = read_upload(source, directory)
            messages = engine.detect_messages(to_waveform(source_path, directory))
    return {"detections": messages}
