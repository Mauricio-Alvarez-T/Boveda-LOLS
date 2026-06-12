#!/bin/bash
# ============================================================
#  Deploy pull-side de STAGING — corre EN el servidor cPanel (cron)
# ============================================================
#
#  Por qué: el FTP de cPanel rechaza/banea la IP entrante del runner de
#  GitHub (cPHulk / firewall de IPs cloud) → el push por FTP desde Actions
#  falla con "Connection refused". Solución: invertir la dirección — el
#  servidor hace `git pull` (conexión SALIENTE a github.com, no bloqueada)
#  y se auto-despliega. GitHub Actions solo compila y publica la rama
#  `deploy-staging` (con frontend/dist prebuildeado + backend/).
#
#  Setup (una vez, en cPanel):
#    1) Git Version Control → clonar el repo, rama `deploy-staging`, en
#       ~/deploy-staging  (repo privado → URL https con PAT scope repo:read).
#    2) Cron Jobs → cada 5 min:
#       */5 * * * * bash ~/deploy-staging/scripts/cpanel-deploy-staging.sh >> ~/deploy-staging.log 2>&1
#
#  Idempotente: si no hay cambios nuevos en origin/deploy-staging, no hace nada.
# ============================================================
set -euo pipefail

# --- Rutas (ajustar si el layout del hosting difiere) ---
REPO_DIR="$HOME/deploy-staging"
FRONT_DEST="$HOME/public_html/test.boveda.lols.cl"
BACK_DEST="$HOME/test-boveda"
BRANCH="deploy-staging"

cd "$REPO_DIR"

# 1) Traer lo último de la rama de build
git fetch origin "$BRANCH" --quiet
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

if [ "$LOCAL" = "$REMOTE" ]; then
    echo "$(date '+%F %T') · sin cambios ($LOCAL) — nada que desplegar"
    exit 0
fi

echo "$(date '+%F %T') · desplegando $REMOTE (antes $LOCAL)"
git reset --hard "origin/$BRANCH" --quiet

# 2) Frontend: copiar dist prebuildeado → docroot de staging
mkdir -p "$FRONT_DEST"
if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$REPO_DIR/frontend/dist/" "$FRONT_DEST/"
else
    # Fallback sin rsync: limpiar y copiar (preserva dotfiles del docroot si los hubiera)
    find "$FRONT_DEST" -mindepth 1 -maxdepth 1 ! -name '.well-known' -exec rm -rf {} +
    cp -a "$REPO_DIR/frontend/dist/." "$FRONT_DEST/"
fi

# 3) Backend: copiar código (sin node_modules/tmp/uploads/.env — se preservan en destino)
mkdir -p "$BACK_DEST"
if command -v rsync >/dev/null 2>&1; then
    rsync -a \
        --exclude 'node_modules/' \
        --exclude 'tmp/' \
        --exclude 'uploads/' \
        --exclude '.env*' \
        "$REPO_DIR/backend/" "$BACK_DEST/"
else
    cp -a "$REPO_DIR/backend/." "$BACK_DEST/"
fi

# 4) Reiniciar Passenger
mkdir -p "$BACK_DEST/tmp"
date > "$BACK_DEST/tmp/restart.txt"

echo "$(date '+%F %T') · deploy OK → $REMOTE"
