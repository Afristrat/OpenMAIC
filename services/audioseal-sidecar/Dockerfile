FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    NO_TORCH_COMPILE=1 \
    QALEM_AUDIOSEAL_DEVICE=cpu \
    QALEM_AUDIOSEAL_MAX_SECONDS=180

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg libsndfile1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.5.1+cpu \
  && pip install --no-cache-dir -r requirements.txt
COPY app.py p2c.py ./

RUN useradd --system --uid 10001 --create-home qalem \
  && chown -R qalem:qalem /app
USER 10001

EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--no-access-log"]
