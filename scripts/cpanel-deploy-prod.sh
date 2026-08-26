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
#   · Repara también el symlink node_modules (se rompe al recrear el venv desde
#     el panel) — solo si la lib del venv tiene paquetes; jamás pisa un dir real.
#   · El heal NO corrige el registro del NodeJS Selector: si el panel guarda
#     server.js, cada SAVE re-rompe hasta 5 min. El fix de raíz es corregir el
#     startup file EN el panel (RUNBOOK §1).
heal_passenger() {
    local ht="$FRONT_DEST/api/.htaccess"
    # Topología real de PROD (verificada 2026-08-24): su config Passenger NO vive en
    # api/.htaccess (esa carpeta no existe en el docroot de prod) sino en el .htaccess
    # del DOCROOT — herencia del Application URL legado ("lols.cl" + ruta). Si api/ no
    # existe pero el .htaccess del docroot tiene bloque Passenger, sanar ese.
    if [ ! -f "$ht" ] && grep -q '^PassengerAppRoot' "$FRONT_DEST/.htaccess" 2>/dev/null; then
        ht="$FRONT_DEST/.htaccess"
    fi
    if [ ! -f "$ht" ]; then
        echo "$(date '+%F %T') · heal: FALTA $ht — restaurar a mano (playbook §7bis)"
        return 0
    fi
    # Guardia anti-carrera con el panel: recién modificado → no tocar este tick.
    if [ -n "$(find "$ht" -mmin -2 2>/dev/null)" ]; then
        return 0
    fi
    local changed=0

    # 1) Startup file: si el configurado no existe O ESTÁ VACÍO (ej. server.js del
    #    panel, o el server.js de 0 bytes creado a mano el 2026-08-24 — un módulo
    #    vacío exporta {} y Passenger queda sin app), corregir a index.js — solo si
    #    index.js SÍ está desplegado con contenido, para no entrar en bucle de
    #    reescritura+restart cuando falta el backend entero.
    #    [^"[:space:]]* en la captura: no arrastra \r/espacios finales (CRLF).
    #    tail -n1: con directivas duplicadas Apache honra la ÚLTIMA.
    local sf
    sf="$(sed -n 's/^PassengerStartupFile[[:space:]]*"\{0,1\}\([^"[:space:]]*\)"\{0,1\}[[:space:]]*$/\1/p' "$ht" | tail -n1)"
    #    app.js EXPLÍCITO también se normaliza a index.js: está DEPRECADO como startup
    #    (su catch traga el error de require('./index') sin re-lanzar — RUNBOOK §1).
    if [ -n "$sf" ] && { [ ! -s "$BACK_DEST/$sf" ] || [ "$sf" = "app.js" ]; }; then
        if [ -s "$BACK_DEST/index.js" ]; then
            sed -i 's|^PassengerStartupFile[[:space:]].*|PassengerStartupFile index.js|' "$ht"
            echo "$(date '+%F %T') · heal: startup file '$sf' inexistente/vacío/deprecado en $BACK_DEST → index.js"
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
            nb="$cand"
            changed=1
        else
            # FALLBACK de emergencia (incidente 2026-08-24/25): venv sin binario Y el
            # panel rechaza regenerarlo ("No such application"). Passenger solo necesita
            # UN node ejecutable; las libs de la app viven en el venv y las enlaza el
            # paso 3 (N-API/JS puro → compatibles entre majors >=18). Preferencia:
            # mismo major que las libs (20), luego 22, luego lo que haya >=18.
            # Revertir al venv cuando el hosting lo reconstruya (basta un SAVE sano).
            local sysn maj=""
            for sysn in /opt/alt/alt-nodejs20/root/usr/bin/node \
                        /opt/alt/alt-nodejs22/root/usr/bin/node \
                        /opt/alt/alt-nodejs18/root/usr/bin/node \
                        /usr/local/bin/node /usr/bin/node; do
                [ -x "$sysn" ] || continue
                maj="$("$sysn" -e 'console.log(process.versions.node.split(".")[0])' 2>/dev/null)" || maj=""
                case "$maj" in ''|*[!0-9]*) continue ;; esac
                if [ "$maj" -ge 18 ]; then cand="$sysn"; break; fi
            done
            if [ -n "$cand" ]; then
                sed -i "s|^PassengerNodejs[[:space:]].*|PassengerNodejs \"$cand\"|" "$ht"
                echo "$(date '+%F %T') · heal: venv sin binario → BYPASS node de sistema $cand (v$maj) — temporal hasta que hosting reconstruya el venv"
                nb="$cand"
                changed=1
            else
                echo "$(date '+%F %T') · heal: node '$nb' no existe, sin nodevenv >=18 NI node de sistema utilizable — se requiere intervención del hosting"
            fi
        fi
    fi

    # 3) node_modules: en CloudLinux es un SYMLINK a ~/nodevenv/<app>/<ver>/lib/node_modules.
    #    Recrear el venv desde el panel lo rompe aunque las libs sobrevivan (caída
    #    2026-08-24: Passenger arrancaba y moría en el primer require()). Repara SOLO
    #    si en la ruta no hay nada (o hay un symlink muerto, que -e no ve) Y la lib del
    #    venv en uso tiene paquetes reales (express). Un node_modules que sea
    #    DIRECTORIO real jamás se toca.
    local nm="$BACK_DEST/node_modules" lib l
    if [ -n "$nb" ] && [ -x "$nb" ]; then
        lib="${nb%/bin/node}/lib/node_modules"
        # Si nb es un node de SISTEMA (bypass manual: /usr/local/bin/node, /opt/alt/…),
        # su lib no es la de la app: buscar la lib del venv PROPIO de la app que tenga
        # paquetes reales (la de mayor versión gana).
        if [ ! -d "$lib/express" ]; then
            for l in "$HOME/nodevenv/$(basename "$BACK_DEST")"/*/lib/node_modules; do
                if [ -d "$l/express" ]; then lib="$l"; fi
            done
        fi
        if [ ! -e "$nm" ]; then
            if [ -d "$lib/express" ]; then
                if [ -L "$nm" ]; then rm -f "$nm"; fi
                ln -s "$lib" "$nm"
                echo "$(date '+%F %T') · heal: symlink node_modules recreado → $lib"
                changed=1
            else
                echo "$(date '+%F %T') · heal: node_modules falta y $lib no tiene paquetes — correr Run NPM Install en Setup Node.js App"
            fi
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

# --- heal-deps:begin — TEMPORAL (incidente 2026-08-24/25; QUITAR al cerrarlo) ---
# Sustituye a npmfix, que nunca corrió: su guard exigía que node_modules fuera
# SYMLINK, pero un SAVE del panel puede dejarlo como DIRECTORIO real PARCIAL
# (en staging quedó con express pero sin el árbol completo) y los requires siguen
# resolviendo exceljs en la lib del venv, donde falta 'tmp' → crash en el primer
# require, la app nunca llega a listen y Passenger responde 500 tras ~65s.
# Diseño probe-driven, sin supuestos de topología: si los deps top-level del
# backend NO CARGAN desde $BACK_DEST con el node del .htaccess, se instala un
# node_modules REAL COMPLETO con `npm ci --omit=dev` (un dir completo gana a
# NODE_PATH en la resolución, así el venv cojo deja de importar). En estado sano
# el probe pasa y esto es un no-op. Reintenta con backoff de 30 min (mtime del
# log) en vez de marker una-pasada: un fallo transitorio de npm no deja el fix
# muerto. Revertir al venv cuando el hosting lo reconstruya (SAVE + NPM Install).
heal_deps() {
    local ht="$FRONT_DEST/api/.htaccess"
    if [ ! -f "$ht" ] && grep -q '^PassengerAppRoot' "$FRONT_DEST/.htaccess" 2>/dev/null; then
        ht="$FRONT_DEST/.htaccess"
    fi
    [ -f "$ht" ] || return 0
    local nb
    nb="$(sed -n 's/^PassengerNodejs[[:space:]]*"\{0,1\}\([^"[:space:]]*\)"\{0,1\}[[:space:]]*$/\1/p' "$ht" | tail -n1)"
    { [ -n "$nb" ] && [ -x "$nb" ]; } || return 0
    { [ -f "$BACK_DEST/package.json" ] && [ -f "$BACK_DEST/package-lock.json" ]; } || return 0

    # Probe: CARGAR (require, no solo resolve) todos los deps top-level. Detecta
    # transitivos ausentes (exceljs→tmp), árboles parciales y bindings nativos rotos.
    local probe='for (const d of Object.keys(require("./package.json").dependencies)) require(d)'
    if (cd "$BACK_DEST" && "$nb" -e "$probe") >/dev/null 2>&1; then
        return 0
    fi

    mkdir -p "$BACK_DEST/tmp"
    local hlog="$BACK_DEST/tmp/deps-heal.log"
    # Backoff: si el último intento fue hace <30 min y seguimos rotos, no martillar
    # npm cada 5 min (cuota o registry caídos se loguean una vez, no 6 por hora).
    if [ -f "$hlog" ] && [ -n "$(find "$hlog" -mmin -30 2>/dev/null)" ]; then
        echo "$(date '+%F %T') · heal-deps: deps rotos pero intento reciente (<30 min) — backoff"
        return 0
    fi
    # Lock anti-solape entre ticks (npm puede tardar más que un tick); stale >30 min se libera.
    local lock="$BACK_DEST/tmp/.deps-heal.lock"
    if [ -d "$lock" ] && [ -n "$(find "$lock" -maxdepth 0 -mmin +30 2>/dev/null)" ]; then
        rmdir "$lock" 2>/dev/null || true
    fi
    if ! mkdir "$lock" 2>/dev/null; then
        echo "$(date '+%F %T') · heal-deps: otro tick instalando (lock) — salto"
        return 0
    fi

    # npm del MISMO toolchain que el node configurado (no mezclar majors); se corre
    # vía "$nb" para no depender del shebang del wrapper.
    local root="${nb%/bin/node}" npmcli="" c
    for c in "$root/lib/node_modules/npm/bin/npm-cli.js" "$root/bin/npm"; do
        if [ -e "$c" ]; then npmcli="$c"; break; fi
    done
    if [ -z "$npmcli" ]; then
        echo "$(date '+%F %T') · heal-deps: no hay npm bajo $root — sin canal de instalación"
        rmdir "$lock" 2>/dev/null || true
        return 0
    fi

    echo "$(date '+%F %T') · heal-deps: deps del backend NO cargan con $nb → npm ci --omit=dev (log: tmp/deps-heal.log)"
    # Un symlink al venv roto se descarta (npm ci a través de él escribiría en el
    # venv); sobre un dir real parcial, npm ci lo limpia y reinstala completo.
    if [ -L "$BACK_DEST/node_modules" ]; then rm -f "$BACK_DEST/node_modules"; fi

    local rc=0 tmo=""
    command -v timeout >/dev/null 2>&1 && tmo="timeout 600"
    ( cd "$BACK_DEST" && PATH="$root/bin:$PATH" $tmo "$nb" "$npmcli" ci --omit=dev --no-audit --no-fund ) > "$hlog" 2>&1 || rc=$?
    rmdir "$lock" 2>/dev/null || true
    if [ "$rc" != "0" ]; then
        echo "$(date '+%F %T') · heal-deps: npm ci falló (rc=$rc) — ver $hlog; reintento en 30 min"
        return 0
    fi
    if (cd "$BACK_DEST" && "$nb" -e "$probe") >/dev/null 2>&1; then
        date > "$BACK_DEST/tmp/restart.txt"
        echo "$(date '+%F %T') · heal-deps: npm ci OK → node_modules real completo + Passenger reiniciado"
    else
        echo "$(date '+%F %T') · heal-deps: npm ci terminó pero los deps siguen sin cargar — ver $hlog"
    fi
    return 0
}
heal_deps || echo "$(date '+%F %T') · heal-deps: falló (rc=$?) — no fatal"
# --- heal-deps:end ---

# --- migrate-once:begin — TEMPORAL (incidente 2026-08-24/25; QUITAR al cerrarlo) ---
# El restore del hosting dejó las BDs sin las migraciones 100-102 (schema_migrations
# termina en la 099 en ambas) y el panel no puede correr scripts: el Selector lanza
# todo con ~/nodevenv/<app>/20/bin/npm, que el restore no devolvió → FileNotFoundError
# ANTES de ejecutar nada. Se corre el runner por acá con node directo: migrate.js
# carga su .env por ruta absoluta, usa el mysql2 del node_modules real (heal-deps) y
# es idempotente (registra en schema_migrations). Marker al ÉXITO + lock anti-solape
# + backoff 30 min si falló (mismo diseño que heal-deps).
run_migrate_once() {
    local done_marker="$BACK_DEST/tmp/.migrate-incidente-20260825.done"
    [ -f "$done_marker" ] && return 0
    local ht="$FRONT_DEST/api/.htaccess"
    if [ ! -f "$ht" ] && grep -q '^PassengerAppRoot' "$FRONT_DEST/.htaccess" 2>/dev/null; then
        ht="$FRONT_DEST/.htaccess"
    fi
    [ -f "$ht" ] || return 0
    local nb
    nb="$(sed -n 's/^PassengerNodejs[[:space:]]*"\{0,1\}\([^"[:space:]]*\)"\{0,1\}[[:space:]]*$/\1/p' "$ht" | tail -n1)"
    { [ -n "$nb" ] && [ -x "$nb" ]; } || return 0
    { [ -f "$BACK_DEST/scripts/migrate.js" ] && [ -d "$BACK_DEST/node_modules/mysql2" ]; } || return 0

    mkdir -p "$BACK_DEST/tmp"
    local mlog="$BACK_DEST/tmp/migrate-incidente.log"
    # Backoff: si el último intento fue hace <30 min y falló, no martillar la BD.
    if [ -f "$mlog" ] && [ -n "$(find "$mlog" -mmin -30 2>/dev/null)" ]; then
        echo "$(date '+%F %T') · migrate-once: intento reciente (<30 min) — backoff"
        return 0
    fi
    local lock="$BACK_DEST/tmp/.migrate-incidente.lock"
    if [ -d "$lock" ] && [ -n "$(find "$lock" -maxdepth 0 -mmin +30 2>/dev/null)" ]; then
        rmdir "$lock" 2>/dev/null || true
    fi
    if ! mkdir "$lock" 2>/dev/null; then
        echo "$(date '+%F %T') · migrate-once: otro tick migrando (lock) — salto"
        return 0
    fi

    echo "$(date '+%F %T') · migrate-once: aplicando migraciones pendientes con $nb (log: tmp/migrate-incidente.log)"
    local rc=0 tmo=""
    command -v timeout >/dev/null 2>&1 && tmo="timeout 600"
    ( cd "$BACK_DEST" && $tmo "$nb" scripts/migrate.js ) > "$mlog" 2>&1 || rc=$?
    rmdir "$lock" 2>/dev/null || true
    if [ "$rc" = "0" ]; then
        date > "$done_marker"
        echo "$(date '+%F %T') · migrate-once: OK — migraciones aplicadas (marker escrito)"
    else
        echo "$(date '+%F %T') · migrate-once: falló (rc=$rc) — ver tmp/migrate-incidente.log; reintento en 30 min"
    fi
    return 0
}
run_migrate_once || echo "$(date '+%F %T') · migrate-once: falló (rc=$?) — no fatal"
# --- migrate-once:end ---

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
