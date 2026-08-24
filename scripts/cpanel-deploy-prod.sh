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

# --- heal:begin — Auto-reparación de Passenger (corre en CADA tick del cron) ---
# Caída real 2026-08-24: al editar la app en Setup Node.js App, el panel reescribió
# el api/.htaccess con "PassengerStartupFile server.js" (archivo que NO existe en el
# repo) y quedó "Web application could not be started" en ambos entornos.
# Reglas de diseño (verificadas con 3 revisores adversariales + sandbox de 9 casos):
#   · JAMÁS tumba el deploy: la llamada va con "|| echo" (este cron es el único
#     canal de reparación del hosting — no hay SSH).
#   · No pelea con cPanel: si el .htaccess fue modificado hace <2 min (¿un SAVE
#     del panel a medias?), espera al próximo tick. sed -i es atómico (tmp+rename).
#   · Corrige SOLO lo verificablemente roto. La línea PassengerStartupFile AUSENTE
#     se deja tal cual: el default de Passenger es app.js, que existe (wrapper
#     legítimo del backend) — no "completar" ese caso.
#   · El heal NO corrige el registro del NodeJS Selector: si el panel guarda
#     server.js, cada SAVE re-rompe hasta 5 min. El fix de raíz es corregir el
#     startup file EN el panel (RUNBOOK §1).
heal_passenger() {
    local ht="$FRONT_DEST/api/.htaccess"
    if [ ! -f "$ht" ]; then
        echo "$(date '+%F %T') · heal: FALTA $ht — restaurar a mano (playbook §7bis)"
        return 0
    fi
    # Guardia anti-carrera con el panel: recién modificado → no tocar este tick.
    if [ -n "$(find "$ht" -mmin -2 2>/dev/null)" ]; then
        return 0
    fi
    local changed=0

    # 1) Startup file: si el configurado no existe (ej. server.js del panel),
    #    corregir a index.js — solo si index.js SÍ está desplegado, para no
    #    entrar en bucle de reescritura+restart cuando falta el backend entero.
    #    [^"[:space:]]* en la captura: no arrastra \r/espacios finales (CRLF).
    #    tail -n1: con directivas duplicadas Apache honra la ÚLTIMA.
    local sf
    sf="$(sed -n 's/^PassengerStartupFile[[:space:]]*"\{0,1\}\([^"[:space:]]*\)"\{0,1\}[[:space:]]*$/\1/p' "$ht" | tail -n1)"
    if [ -n "$sf" ] && [ ! -f "$BACK_DEST/$sf" ]; then
        if [ -f "$BACK_DEST/index.js" ]; then
            sed -i 's|^PassengerStartupFile[[:space:]].*|PassengerStartupFile index.js|' "$ht"
            echo "$(date '+%F %T') · heal: startup file '$sf' no existe en $BACK_DEST → index.js"
            changed=1
        else
            echo "$(date '+%F %T') · heal: ni '$sf' ni index.js existen en $BACK_DEST — backend sin desplegar, no toco nada"
        fi
    fi

    # 2) Binario de Node: si el configurado no existe (venv borrado/recreado),
    #    apuntar al nodevenv de MAYOR versión numérica, mínimo 18 (sharp exige
    #    Node >= 18.17; y un venv viejo tampoco tendría los node_modules).
    local nb
    nb="$(sed -n 's/^PassengerNodejs[[:space:]]*"\{0,1\}\([^"[:space:]]*\)"\{0,1\}[[:space:]]*$/\1/p' "$ht" | tail -n1)"
    if [ -n "$nb" ] && [ ! -x "$nb" ]; then
        local cand="" best=0 n v
        for n in "$HOME/nodevenv/$(basename "$BACK_DEST")"/*/bin/node; do
            v="${n%/bin/node}"; v="${v##*/}"
            case "$v" in *[!0-9]*) continue ;; esac
            if [ -x "$n" ] && [ "$v" -ge 18 ] && [ "$v" -gt "$best" ]; then best="$v"; cand="$n"; fi
        done
        if [ -n "$cand" ]; then
            sed -i "s|^PassengerNodejs[[:space:]].*|PassengerNodejs \"$cand\"|" "$ht"
            echo "$(date '+%F %T') · heal: node '$nb' no existe → $cand"
            changed=1
        else
            echo "$(date '+%F %T') · heal: node '$nb' no existe y NO hay nodevenv >=18 para $(basename "$BACK_DEST") — recrear desde Setup Node.js App (elegir versión → SAVE → Run NPM Install)"
        fi
    fi

    if [ "$changed" = "1" ]; then
        mkdir -p "$BACK_DEST/tmp"
        date > "$BACK_DEST/tmp/restart.txt"
        echo "$(date '+%F %T') · heal: .htaccess corregido + Passenger reiniciado"
    fi
    return 0
}
# "|| echo": un fallo del heal (cuota de disco, permisos, binario ausente) se
# loguea y el deploy CONTINÚA. El || además desactiva set -e dentro de la función
# (deseado: su control de flujo es todo por if, nada depende de -e).
heal_passenger || echo "$(date '+%F %T') · heal: falló (rc=$?) — no fatal, el deploy continúa"
# --- heal:end ---

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
