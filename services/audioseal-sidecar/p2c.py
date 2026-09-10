"""P2-C proof harness for AudioSeal robustness transformations.

Run inside a controlled validation container with QALEM_AUDIOSEAL_TOKEN set.
It deliberately fails rather than report a partial opaque identifier.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path

import requests

SEGMENTS = 11


def encode(watermark_id: str) -> list[int]:
    raw = bytes.fromhex(watermark_id)
    if len(raw) != 16:
        raise ValueError("watermark_id must be exactly 128 bits")
    bits = "".join(f"{byte:08b}" for byte in raw)
    checksum = 0
    for byte in raw:
        checksum ^= byte
    values = [int(bits[index * 12 : index * 12 + 12], 2) for index in range(10)]
    values.append((int(bits[120:], 2) << 4) | (checksum & 0x0F))
    return [(index << 12) | value for index, value in enumerate(values)]


def decode(messages: list[int]) -> str | None:
    found: dict[int, int] = {}
    for message in messages:
        if not 0 <= message <= 0xFFFF:
            return None
        index, value = message >> 12, message & 0x0FFF
        if index >= SEGMENTS or (index in found and found[index] != value):
            return None
        found[index] = value
    if len(found) != SEGMENTS:
        return None
    bits = "".join(f"{found[index]:012b}" for index in range(10)) + f"{found[10] >> 4:08b}"
    raw = bytes(int(bits[index : index + 8], 2) for index in range(0, 128, 8))
    checksum = 0
    for byte in raw:
        checksum ^= byte
    return raw.hex() if checksum & 0x0F == found[10] & 0x0F else None


def run_ffmpeg(source: Path, destination: Path, args: list[str]) -> None:
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source), *args, str(destination)],
        check=True,
        timeout=90,
    )


def call_detect(url: str, token: str, source: Path) -> list[int]:
    with source.open("rb") as handle:
        response = requests.post(
            f"{url}/v1/detect",
            headers={"Authorization": f"Bearer {token}"},
            files={"source": (source.name, handle, "audio/mpeg")},
            timeout=120,
        )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload.get("messages"), list):
        raise RuntimeError("sidecar detector returned no messages")
    return [int(message) for message in payload["messages"]]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="Authorized spoken fixture, at least 44 seconds")
    parser.add_argument("--url", default=os.environ.get("QALEM_AUDIOSEAL_URL"))
    parser.add_argument("--watermark-id", default="0123456789abcdef0123456789abcdef")
    args = parser.parse_args()
    token = os.environ.get("QALEM_AUDIOSEAL_TOKEN")
    if not args.url or not token:
        raise RuntimeError("QALEM_AUDIOSEAL_URL and QALEM_AUDIOSEAL_TOKEN are required")
    if not args.source.is_file():
        raise RuntimeError("authorized source fixture is missing")

    messages = encode(args.watermark_id)
    with args.source.open("rb") as handle:
        response = requests.post(
            f"{args.url.rstrip('/')}/v1/watermark",
            headers={"Authorization": f"Bearer {token}"},
            data={"messages": json.dumps(messages)},
            files={"source": (args.source.name, handle, "video/mp4")},
            timeout=180,
        )
    response.raise_for_status()
    if response.headers.get("x-qalem-audioseal-model") != "audioseal_wm_16bits":
        raise RuntimeError("sidecar model attestation failed")

    with tempfile.TemporaryDirectory(prefix="qalem-audioseal-p2c-") as temporary:
        directory = Path(temporary)
        marked = directory / "marked.mp3"
        marked.write_bytes(response.content)
        variants = {"original": marked}
        variants["mp3_128k"] = directory / "mp3-128k.mp3"
        run_ffmpeg(marked, variants["mp3_128k"], ["-c:a", "libmp3lame", "-b:a", "128k"])
        variants["ogg"] = directory / "marked.ogg"
        run_ffmpeg(marked, variants["ogg"], ["-c:a", "libvorbis", "-q:a", "5"])
        variants["normalized"] = directory / "normalized.mp3"
        run_ffmpeg(marked, variants["normalized"], ["-af", "loudnorm", "-c:a", "libmp3lame", "-b:a", "128k"])
        variants["crop_30s"] = directory / "crop-30s.mp3"
        run_ffmpeg(marked, variants["crop_30s"], ["-ss", "1", "-t", "30", "-c:a", "libmp3lame", "-b:a", "128k"])

        proof: dict[str, dict[str, object]] = {}
        for name, variant in variants.items():
            detected = call_detect(args.url.rstrip("/"), token, variant)
            recovered = decode(detected)
            proof[name] = {
                "sha256": hashlib.sha256(variant.read_bytes()).hexdigest(),
                "detectedSegmentCount": len(detected),
                "detectedMessages": detected,
                "recoveredWatermarkId": recovered,
            }
            if recovered != args.watermark_id:
                print(json.dumps(proof, sort_keys=True))
                raise RuntimeError(f"P2-C failed after {name}")
    print(json.dumps(proof, sort_keys=True))


if __name__ == "__main__":
    main()
