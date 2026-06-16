#!/bin/bash
# ============================================================
#  Deploy pull-side de PRODUCCIÓN — corre EN el servidor cPanel (cron)
# ============================================================
#
#  Gemelo de cpanel-deploy-staging.sh, pero para boveda.lols.cl (prod).
#  Por qué: el FTP de cPanel banea de forma PERSISTENTE la IP del runner de
#  GitHub (cPHulk) → el push por FTP desde Actions falla con
#  "Connection refused". Solución: invertir la dirección — el servidor hace
#  `git pull` (saliente, no bloqueado) y se auto-despliega. GitHub Actions
#  solo compila y publica la rama `deploy-prod` (frontend/dist + backend/).
#
#  Setup (una vez, en cPanel). Guía: docs/PLAYBOOK_PULL_SIDE_CPANEL.md (§7 prod).
#  El repo es PÚBLICO → el clone NO necesita token.
#    - Bootstrap del clone (cron one-shot idempotente, borrar tras clonar):
#        GIT_TERMINAL_PROMPT=0 sh -c 'test -d ~/deploy-prod/.git || git clone --branch deploy-prod https://github.com/Mauricio-Alvarez-T/Boveda-LOLS.git ~/deploy-prod' >> ~/deploy-prod-bootstrap.log 2>&1
#    - Cron cada 5 min (self-healing — pre-carga el .sh antes de correrlo):
#        cd /home/lolscl/deploy-prod && git fetch -q origin deploy-prod && git checkout -q -f origin/deploy-prod -- scripts/cpanel-deploy-prod.sh 2>/dev/null; HOME=/home/lolscl GIT_TERMINAL_PROMPT=0 /bin/bash /home/lolscl/deploy-prod/scripts/cpanel-deploy-prod.sh >> /home/lolscl/deploy-prod.log 2>&1
#
#  Idempotente: si no hay cambios nuevos en origin/deploy-prod, no hace nada.
# ============================================================
set -euo pipefail

# --- Rutas (espejo de prod; ver deploy-cpanel.yml viejo: docroot y /boveda/) ---
REPO_DIR="$HOME/deploy-prod"
FRONT_DEST="$HOME/public_html/boveda.lols.cl"
BACK_DEST="$HOME/boveda"
BRANCH="deploy-prod"

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

# 2) Frontend: copiar dist prebuildeado → docroot de prod
mkdir -p "$FRONT_DEST"
if command -v rsync >/dev/null 2>&1; then
    # --delete espeja dist, PERO preserva lo que NO es del build y vive en el docroot:
    #   .well-known/ → AutoSSL/Let's Encrypt
    #   .htaccess    → routing del SPA
    #   api/         → mount de Passenger del backend (boveda.lols.cl/api) — borrarlo ROMPE la API
    rsync -a --delete \
        --exclude '.well-known/' \
        --exclude '.htaccess' \
        --exclude 'api/' \
        "$REPO_DIR/frontend/dist/" "$FRONT_DEST/"
else
    find "$FRONT_DEST" -mindepth 1 -maxdepth 1 ! -name '.well-known' ! -name '.htaccess' ! -name 'api' -exec rm -rf {} +
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
