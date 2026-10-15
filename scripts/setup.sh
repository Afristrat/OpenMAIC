#!/usr/bin/env bash
# =============================================================================
# Qalem — Docker Setup Script
# Initializes environment, generates secrets, creates S3 buckets,
# and runs Supabase migrations.
#
# Usage:
#   bash scripts/setup.sh          # Full setup
#   bash scripts/setup.sh --reset  # Reset .env.local and regenerate secrets
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env.local"
ENV_EXAMPLE="$PROJECT_DIR/.env.docker.example"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.production.yml"

# Compose interpole ${VAR:?...} depuis .env, --env-file ou le shell (pas depuis l'env_file des
# conteneurs) : chaque appel passe donc explicitement le fichier d'environnement local.
dc() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

# true : écrase les valeurs du modèle copié (création ou --reset) ; false : ne complète que le manquant.
ENV_FORCE="false"

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ── Prerequisite checks ─────────────────────────────────────────────────────
check_prerequisites() {
  info "Checking prerequisites..."

  if ! command -v docker &>/dev/null; then
    error "Docker is not installed. Install from https://docs.docker.com/get-docker/"
  fi

  if ! docker compose version &>/dev/null && ! docker-compose version &>/dev/null; then
    error "Docker Compose is not available. Install Docker Compose v2."
  fi

  if ! command -v openssl &>/dev/null; then
    error "openssl is required to generate secrets."
  fi

  ok "Docker, Docker Compose and openssl are available."
}

# ── Secret generation ────────────────────────────────────────────────────────
generate_secret() {
  local length="${1:-32}"
  openssl rand -base64 "$length" 2>/dev/null | tr -d '=/+' | head -c "$length"
}

generate_jwt_secret() {
  # Generate a 64-char hex secret suitable for HS256
  openssl rand -hex 32 2>/dev/null
}

# ── Environment file helpers (jamais d'affichage des valeurs) ────────────────
env_get() {
  { grep -m1 "^$1=" "$ENV_FILE" || true; } | cut -d= -f2- | tr -d '\r'
}

# Valeur absente, vide ou placeholder (CHANGE_ME…) ?
env_is_unset() {
  local current
  current="$(env_get "$1")"
  [[ -z "$current" || "$current" == CHANGE_ME* ]]
}

# Écrit NAME=valeur (remplace la ligne existante, sinon l'ajoute en fin de fichier).
set_var() {
  local name="$1" value="$2" escaped
  if [[ -z "$value" ]]; then
    error "Empty value for $name (secret generation failed)."
  fi
  if grep -q "^$name=" "$ENV_FILE"; then
    escaped="${value//\\/\\\\}"
    escaped="${escaped//&/\\&}"
    escaped="${escaped//|/\\|}"
    sed -i "s|^$name=.*|$name=$escaped|" "$ENV_FILE"
  else
    if [[ -s "$ENV_FILE" && -n "$(tail -c1 "$ENV_FILE")" ]]; then
      echo >> "$ENV_FILE"
    fi
    printf '%s=%s\n' "$name" "$value" >> "$ENV_FILE"
  fi
}

# Génère NAME seulement s'il est manquant (ou en mode ENV_FORCE) : idempotent, n'écrase jamais.
ensure_var() {
  local name="$1" value="$2"
  if [[ "$ENV_FORCE" == "true" ]] || env_is_unset "$name"; then
    set_var "$name" "$value"
    info "Generated $name."
  fi
}

# JWT HS256 Supabase pour un rôle ; le secret transite par l'environnement, jamais par la ligne de commande.
sign_supabase_jwt() {
  JWT_ROLE="$1" JWT_SIGNING_SECRET="$2" node -e "
    const crypto = require('crypto');
    function sign(payload, secret) {
      const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const sig = crypto.createHmac('sha256', secret).update(header+'.'+body).digest('base64url');
      return header+'.'+body+'.'+sig;
    }
    const exp = Math.floor(Date.now()/1000) + 10*365*24*3600;
    console.log(sign({role:process.env.JWT_ROLE,iss:'supabase',iat:Math.floor(Date.now()/1000),exp}, process.env.JWT_SIGNING_SECRET));
  "
}

# Variables obligatoires de la pile Docker (docker-compose.production.yml et docker-compose.observability.yml).
ensure_compose_env() {
  ensure_var POSTGRES_PASSWORD "$(generate_secret 32)"
  ensure_var JWT_SECRET "$(generate_jwt_secret)"
  ensure_var REDIS_PASSWORD "$(openssl rand -hex 32)"
  ensure_var RUSTFS_ACCESS_KEY "qalem$(openssl rand -hex 6)"
  ensure_var RUSTFS_SECRET_KEY "$(generate_secret 24)"
  ensure_var QALEM_AUDIOSEAL_TOKEN "$(openssl rand -hex 32)"
  ensure_var CAPTURE_WORKER_TOKEN "$(openssl rand -hex 32)"
  ensure_var GRAFANA_ADMIN_PASSWORD "$(openssl rand -hex 32)"
  ensure_var GLITCHTIP_DB_PASSWORD "$(openssl rand -hex 32)"
  ensure_var GLITCHTIP_SECRET_KEY "$(openssl rand -hex 50)"

  # URLs publiques (obligatoires dans le compose) : valeur du shell si exportée, sinon localhost.
  ensure_var API_EXTERNAL_URL "${API_EXTERNAL_URL:-http://localhost:8000}"
  ensure_var SITE_URL "${SITE_URL:-http://localhost:3000}"

  # Clés Supabase anon et service_role : JWT signés avec JWT_SECRET (régénérés ensemble).
  if [[ "$ENV_FORCE" == "true" ]] || env_is_unset ANON_KEY || env_is_unset SERVICE_ROLE_KEY; then
    if command -v node &>/dev/null; then
      info "Generating Supabase JWT keys with Node.js..."
      local jwt_secret anon_key service_role_key
      jwt_secret="$(env_get JWT_SECRET)"
      anon_key="$(sign_supabase_jwt anon "$jwt_secret")"
      service_role_key="$(sign_supabase_jwt service_role "$jwt_secret")"

      set_var ANON_KEY "$anon_key"
      set_var SERVICE_ROLE_KEY "$service_role_key"
      set_var NEXT_PUBLIC_SUPABASE_ANON_KEY "$anon_key"
      set_var SUPABASE_SERVICE_ROLE_KEY "$service_role_key"

      ok "Supabase JWT keys generated."
    else
      warn "Node.js not found. You must manually generate ANON_KEY and SERVICE_ROLE_KEY (docker compose refuses to start without them)."
      warn "See: https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys"
    fi
  fi
}

# ── Environment file setup ───────────────────────────────────────────────────
setup_env() {
  local reset="${1:-false}"

  if [[ -f "$ENV_FILE" && "$reset" != "true" ]]; then
    warn ".env.local already exists. Use --reset to regenerate."
    info "Completing missing Compose variables (existing values are kept)..."
    ensure_compose_env
    return 0
  fi

  if [[ ! -f "$ENV_EXAMPLE" ]]; then
    error ".env.docker.example not found at $ENV_EXAMPLE"
  fi

  info "Creating .env.local from .env.docker.example..."
  cp "$ENV_EXAMPLE" "$ENV_FILE"

  # Generate every secret and variable required by the Compose files (values are never printed)
  ENV_FORCE="true"
  ensure_compose_env
  ENV_FORCE="false"
  chmod 600 "$ENV_FILE" 2>/dev/null || true

  ok ".env.local created with generated secrets."
  warn "Edit .env.local to add your LLM API keys (at least one provider is required)."
}

# ── Start infrastructure ─────────────────────────────────────────────────────
start_infrastructure() {
  info "Starting infrastructure services (DB, Redis, RustFS)..."
  dc up -d supabase-db redis rustfs

  info "Waiting for services to be healthy..."
  local max_wait=60
  local elapsed=0
  while [[ $elapsed -lt $max_wait ]]; do
    if dc ps --format json 2>/dev/null | grep -q '"Health":"healthy"' || \
       dc ps 2>/dev/null | grep -q "(healthy)"; then
      break
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done

  if [[ $elapsed -ge $max_wait ]]; then
    warn "Some services may not be healthy yet. Check with: docker compose --env-file .env.local -f docker-compose.production.yml ps"
  else
    ok "Infrastructure services are healthy."
  fi
}

# ── S3 bucket creation ───────────────────────────────────────────────────────
create_s3_buckets() {
  info "Creating S3 buckets via init container..."
  dc up rustfs-init
  ok "S3 buckets created (audio, images, exports, uploads)."
}

# ── Run Supabase migrations ─────────────────────────────────────────────────
run_migrations() {
  local migration_dir="$PROJECT_DIR/supabase/migrations"

  if [[ ! -d "$migration_dir" ]]; then
    warn "No migrations directory found at $migration_dir. Skipping."
    return 0
  fi

  local migration_count
  migration_count=$(find "$migration_dir" -name "*.sql" -type f | wc -l)

  if [[ "$migration_count" -eq 0 ]]; then
    warn "No SQL migration files found. Skipping."
    return 0
  fi

  info "Running $migration_count migration(s)..."

  # Migrations are auto-applied via docker-entrypoint-initdb.d on first start.
  # For subsequent runs, apply manually:
  for sql_file in "$migration_dir"/*.sql; do
    local filename
    filename="$(basename "$sql_file")"
    info "  Applying: $filename"
    dc exec -T supabase-db \
      psql -U postgres -d postgres -f "/docker-entrypoint-initdb.d/migrations/$filename" 2>/dev/null || \
      warn "  Migration $filename may have already been applied."
  done

  ok "Migrations complete."
}

# ── Main ─────────────────────────────────────────────────────────────────────
main() {
  echo ""
  echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║         Qalem — Docker Production Setup         ║${NC}"
  echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
  echo ""

  local reset="false"
  if [[ "${1:-}" == "--reset" ]]; then
    reset="true"
    warn "Reset mode: .env.local will be regenerated."
  fi

  check_prerequisites
  setup_env "$reset"

  echo ""
  info "Environment is ready. Next steps:"
  echo ""
  echo -e "  ${GREEN}1.${NC} Edit .env.local — add at least one LLM provider API key"
  echo -e "  ${GREEN}2.${NC} Start all services:"
  echo -e "     ${YELLOW}docker compose --env-file .env.local -f docker-compose.production.yml up -d --build${NC}"
  echo -e "  ${GREEN}3.${NC} Open http://localhost:3000"
  echo -e "  ${BLUE}Public deployment:${NC} set API_EXTERNAL_URL and SITE_URL in .env.local (localhost by default)."
  echo -e "  ${BLUE}Observability stack:${NC} also needs METRICS_TOKEN_FILE (see docs/self-hosted.md)."
  echo ""
  echo -e "  ${BLUE}Useful commands:${NC}"
  echo -e "     ${YELLOW}docker compose --env-file .env.local -f docker-compose.production.yml ps${NC}        # Service status"
  echo -e "     ${YELLOW}docker compose --env-file .env.local -f docker-compose.production.yml logs -f${NC}   # Follow logs"
  echo -e "     ${YELLOW}docker compose --env-file .env.local -f docker-compose.production.yml down${NC}      # Stop all"
  echo ""

  # Ask if user wants to start services now
  if [[ -t 0 ]]; then
    read -rp "$(echo -e "${BLUE}Start services now? [y/N]${NC} ")" start_now
    if [[ "$start_now" =~ ^[Yy]$ ]]; then
      start_infrastructure
      create_s3_buckets
      run_migrations

      info "Starting remaining services..."
      dc up -d --build

      echo ""
      ok "Qalem is starting up!"
      echo -e "  App:           ${GREEN}http://localhost:${QALEM_PORT:-3000}${NC}"
      echo -e "  Supabase API:  ${GREEN}http://localhost:${KONG_PORT:-8000}${NC}"
      echo -e "  RustFS Console: ${GREEN}http://localhost:${RUSTFS_CONSOLE_PORT:-9001}${NC}"
      echo ""
    fi
  fi
}

main "$@"
