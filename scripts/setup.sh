#!/usr/bin/env bash
# =============================================================================
# Qalem — Docker Setup Script
# Initializes environment, generates secrets, creates MinIO buckets,
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

  ok "Docker and Docker Compose are available."
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

# ── Environment file setup ───────────────────────────────────────────────────
setup_env() {
  local reset="${1:-false}"

  if [[ -f "$ENV_FILE" && "$reset" != "true" ]]; then
    warn ".env.local already exists. Use --reset to regenerate."
    return 0
  fi

  if [[ ! -f "$ENV_EXAMPLE" ]]; then
    error ".env.docker.example not found at $ENV_EXAMPLE"
  fi

  info "Creating .env.local from .env.docker.example..."
  cp "$ENV_EXAMPLE" "$ENV_FILE"

  # Generate secrets
  local pg_password
  local jwt_secret
  pg_password="$(generate_secret 32)"
  jwt_secret="$(generate_jwt_secret)"

  info "Generating POSTGRES_PASSWORD..."
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$pg_password|" "$ENV_FILE"

  info "Generating JWT_SECRET..."
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$jwt_secret|" "$ENV_FILE"

  # Generate Supabase anon and service_role keys using the JWT secret
  # These are JWTs signed with HS256 using the JWT_SECRET
  if command -v node &>/dev/null; then
    info "Generating Supabase JWT keys with Node.js..."

    local anon_key
    local service_role_key
    anon_key=$(node -e "
      const crypto = require('crypto');
      function sign(payload, secret) {
        const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
        const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const sig = crypto.createHmac('sha256', secret).update(header+'.'+body).digest('base64url');
        return header+'.'+body+'.'+sig;
      }
      const exp = Math.floor(Date.now()/1000) + 10*365*24*3600;
      console.log(sign({role:'anon',iss:'supabase',iat:Math.floor(Date.now()/1000),exp}, '$jwt_secret'));
    ")
    service_role_key=$(node -e "
      const crypto = require('crypto');
      function sign(payload, secret) {
        const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
        const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const sig = crypto.createHmac('sha256', secret).update(header+'.'+body).digest('base64url');
        return header+'.'+body+'.'+sig;
      }
      const exp = Math.floor(Date.now()/1000) + 10*365*24*3600;
      console.log(sign({role:'service_role',iss:'supabase',iat:Math.floor(Date.now()/1000),exp}, '$jwt_secret'));
    ")

    sed -i "s|^ANON_KEY=.*|ANON_KEY=$anon_key|" "$ENV_FILE"
    sed -i "s|^SERVICE_ROLE_KEY=.*|SERVICE_ROLE_KEY=$service_role_key|" "$ENV_FILE"
    sed -i "s|^NEXT_PUBLIC_SUPABASE_ANON_KEY=.*|NEXT_PUBLIC_SUPABASE_ANON_KEY=$anon_key|" "$ENV_FILE"
    sed -i "s|^SUPABASE_SERVICE_ROLE_KEY=.*|SUPABASE_SERVICE_ROLE_KEY=$service_role_key|" "$ENV_FILE"

    ok "Supabase JWT keys generated."
  else
    warn "Node.js not found. You must manually generate ANON_KEY and SERVICE_ROLE_KEY."
    warn "See: https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys"
  fi

  # Generate MinIO password
  local minio_password
  minio_password="$(generate_secret 24)"
  sed -i "s|^MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=$minio_password|" "$ENV_FILE"

  ok ".env.local created with generated secrets."
  warn "Edit .env.local to add your LLM API keys (at least one provider is required)."
}

# ── Start infrastructure ─────────────────────────────────────────────────────
start_infrastructure() {
  info "Starting infrastructure services (DB, Redis, MinIO)..."
  docker compose -f "$COMPOSE_FILE" up -d supabase-db redis minio

  info "Waiting for services to be healthy..."
  local max_wait=60
  local elapsed=0
  while [[ $elapsed -lt $max_wait ]]; do
    if docker compose -f "$COMPOSE_FILE" ps --format json 2>/dev/null | grep -q '"Health":"healthy"' || \
       docker compose -f "$COMPOSE_FILE" ps 2>/dev/null | grep -q "(healthy)"; then
      break
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done

  if [[ $elapsed -ge $max_wait ]]; then
    warn "Some services may not be healthy yet. Check with: docker compose -f docker-compose.production.yml ps"
  else
    ok "Infrastructure services are healthy."
  fi
}

# ── MinIO bucket creation ────────────────────────────────────────────────────
create_minio_buckets() {
  info "Creating MinIO buckets via init container..."
  docker compose -f "$COMPOSE_FILE" up minio-init
  ok "MinIO buckets created (audio, images, exports, uploads)."
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
    docker compose -f "$COMPOSE_FILE" exec -T supabase-db \
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
  echo -e "     ${YELLOW}docker compose -f docker-compose.production.yml up -d --build${NC}"
  echo -e "  ${GREEN}3.${NC} Open http://localhost:3000"
  echo ""
  echo -e "  ${BLUE}Useful commands:${NC}"
  echo -e "     ${YELLOW}docker compose -f docker-compose.production.yml ps${NC}        # Service status"
  echo -e "     ${YELLOW}docker compose -f docker-compose.production.yml logs -f${NC}   # Follow logs"
  echo -e "     ${YELLOW}docker compose -f docker-compose.production.yml down${NC}      # Stop all"
  echo ""

  # Ask if user wants to start services now
  if [[ -t 0 ]]; then
    read -rp "$(echo -e "${BLUE}Start services now? [y/N]${NC} ")" start_now
    if [[ "$start_now" =~ ^[Yy]$ ]]; then
      start_infrastructure
      create_minio_buckets
      run_migrations

      info "Starting remaining services..."
      docker compose -f "$COMPOSE_FILE" up -d --build

      echo ""
      ok "Qalem is starting up!"
      echo -e "  App:           ${GREEN}http://localhost:${QALEM_PORT:-3000}${NC}"
      echo -e "  Supabase API:  ${GREEN}http://localhost:${KONG_PORT:-8000}${NC}"
      echo -e "  MinIO Console: ${GREEN}http://localhost:${MINIO_CONSOLE_PORT:-9001}${NC}"
      echo ""
    fi
  fi
}

main "$@"
