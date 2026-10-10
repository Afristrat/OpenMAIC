FROM python:3.11-slim

WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .

# Utilisateur non privilégié : la passerelle ne manipule que des requêtes HTTP.
RUN useradd --system --no-create-home gateway
USER gateway

EXPOSE 8190
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8190"]
