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
#  Setup (una vez, en cPanel). Guía completa: docs/PLAYBOOK_PULL_SIDE_CPANEL.md.
#  El repo es PÚBLICO → el clone NO necesita token.
#    - Con Terminal / Git Version Control: clonar la rama `deploy-staging` en ~/deploy-staging.
#    - SIN Terminal ni Git VC (caso de este hosting) → bootstrap por Cron Jobs:
#        # one-shot idempotente (borrar tras clonar):
#        GIT_TERMINAL_PROMPT=0 sh -c 'test -d ~/deploy-staging/.git || git clone --branch deploy-staging https://github.com/Mauricio-Alvarez-T/Boveda-LOLS.git ~/deploy-staging' >> ~/deploy-bootstrap.log 2>&1
#    Luego Cron Jobs → cada 5 min:
#       */5 * * * * HOME=/home/lolscl /bin/bash ~/deploy-staging/scripts/cpanel-deploy-staging.sh >> ~/deploy-staging.log 2>&1
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
    # (En staging api/.htaccess SÍ existe y este fallback no se activa.)
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

# --- npmfix:begin — TEMPORAL (incidente 2026-08-24/25; QUITAR al cerrarlo) ---
# La lib del venv quedó INCOMPLETA (falta 'tmp', dep transitiva de exceljs → la app
# crashea al arrancar). El panel no puede correr NPM Install ("No such application"),
# así que se completa UNA sola vez con el npm de /opt/alt, instalando a través del
# symlink node_modules → lib del venv. Marker-file para no repetirse; se marca ANTES
# de correr para que un tick solapado del cron no lo duplique.
npmfix() {
    local marker="$BACK_DEST/.npmfix-20260825"
    local npmbin="/opt/alt/alt-nodejs20/root/usr/bin/npm"
    [ -f "$marker" ] && return 0
    [ -L "$BACK_DEST/node_modules" ] || return 0   # sin symlink aún → esperar al heal
    [ -d "$BACK_DEST/node_modules/tmp" ] && return 0
    if [ ! -x "$npmbin" ]; then
        echo "$(date '+%F %T') · npmfix: no hay npm en $npmbin — completar deps a mano"
        return 0
    fi
    date > "$marker"
    echo "$(date '+%F %T') · npmfix: lib incompleta (falta 'tmp') → npm install --omit=dev en $BACK_DEST (una sola vez; log: ~/npmfix-$(basename "$BACK_DEST").log)"
    ( cd "$BACK_DEST" && PATH="/opt/alt/alt-nodejs20/root/usr/bin:$PATH" \
        "$npmbin" install --omit=dev --no-audit --no-fund ) \
        >> "$HOME/npmfix-$(basename "$BACK_DEST").log" 2>&1
    local rc=$?
    echo "$(date '+%F %T') · npmfix: terminó rc=$rc"
    if [ "$rc" = "0" ]; then
        mkdir -p "$BACK_DEST/tmp"
        date > "$BACK_DEST/tmp/restart.txt"
        echo "$(date '+%F %T') · npmfix: Passenger reiniciado"
    fi
    return 0
}
npmfix || echo "$(date '+%F %T') · npmfix: falló (rc=$?) — no fatal"
# --- npmfix:end ---

# --- diag:begin — Diagnóstico TEMPORAL del incidente 2026-08-24 (QUITAR al cerrarlo) ---
# Escribe un resumen de estado en el docroot para poder leerlo por HTTP desde
# afuera (este hosting no tiene SSH). Sin credenciales: la prueba de MySQL usa
# el .env solo en memoria y publica únicamente OK/FALLA.
diag_incidente() {
    local out="$FRONT_DEST/_diag-incidente.txt"
    {
        echo "ts=$(date '+%F %T')"
        local ht="$FRONT_DEST/api/.htaccess"
        if [ ! -f "$ht" ] && grep -q '^PassengerAppRoot' "$FRONT_DEST/.htaccess" 2>/dev/null; then
            ht="$FRONT_DEST/.htaccess"
        fi
        if [ -f "$ht" ]; then
            echo "htaccess=presente mtime=$(date -r "$ht" '+%F %T')"
            grep -E '^Passenger(StartupFile|Nodejs|AppRoot|AppType|BaseURI)' "$ht" 2>/dev/null | sed 's/^/ht> /'
        else
            echo "htaccess=AUSENTE"
        fi
        local nb=""
        [ -f "$ht" ] && nb="$(sed -n 's/^PassengerNodejs[[:space:]]*"\{0,1\}\([^"[:space:]]*\)"\{0,1\}[[:space:]]*$/\1/p' "$ht" | tail -n1)"
        if [ -n "$nb" ]; then [ -x "$nb" ] && echo "node_bin=OK" || echo "node_bin=NO_EXISTE"; fi
        echo "venvs_app=$(ls -m "$HOME/nodevenv/$(basename "$BACK_DEST")" 2>/dev/null || echo NINGUNO)"
        echo "venvs_todos=$(ls -m "$HOME/nodevenv" 2>/dev/null || echo NINGUNO)"
        [ -f "$BACK_DEST/index.js" ] && echo "index.js=OK" || echo "index.js=FALTA"
        [ -e "$BACK_DEST/node_modules" ] && { [ -d "$BACK_DEST/node_modules/express" ] && echo "node_modules=OK" || echo "node_modules=ROTO_O_SYMLINK_COLGANDO"; } || echo "node_modules=FALTA"
        [ -f "$BACK_DEST/.env" ] && echo "env=OK" || echo "env=FALTA"
        command -v cloudlinux-selector >/dev/null 2>&1 && echo "selector=disponible" || echo "selector=no"
        local c
        echo "opt_alt=$(ls -m /opt/alt 2>/dev/null || echo NO_VISIBLE)"
        for c in /opt/alt/alt-nodejs20/root/usr/bin/node /opt/alt/alt-nodejs22/root/usr/bin/node /opt/alt/alt-nodejs18/root/usr/bin/node /usr/local/bin/node /usr/bin/node; do
            [ -x "$c" ] && echo "sysnode $c = $("$c" -v 2>/dev/null || echo ERROR)"
        done
        if command -v mysql >/dev/null 2>&1 && [ -f "$BACK_DEST/.env" ]; then
            local H U P N
            H=$(sed -n 's/^DB_HOST=//p' "$BACK_DEST/.env" | tr -d '\r"' | tail -1)
            U=$(sed -n 's/^DB_USER=//p' "$BACK_DEST/.env" | tr -d '\r"' | tail -1)
            P=$(sed -n 's/^DB_PASSWORD=//p' "$BACK_DEST/.env" | tr -d '\r"' | tail -1)
            N=$(sed -n 's/^DB_NAME=//p' "$BACK_DEST/.env" | tr -d '\r"' | tail -1)
            if MYSQL_PWD="$P" mysql -h "${H:-localhost}" -u "$U" -D "$N" -e 'SELECT 1' >/dev/null 2>&1; then
                echo "mysql=OK"
            else
                echo "mysql=FALLA"
            fi
        else
            echo "mysql=SIN_CLIENTE_O_ENV"
        fi
        local lg
        for lg in "$BACK_DEST/startup_debug.log" "$BACK_DEST/startup_app.log"; do
            if [ -f "$lg" ]; then
                echo "log_$(basename "$lg")_mtime=$(date -r "$lg" '+%F %T')"
                tail -n 40 "$lg" 2>/dev/null | sed 's/^/log> /'
            fi
        done
        echo "deploylog_tail:"
        tail -n 8 "${REPO_DIR}.log" 2>/dev/null | sed 's/^/dl> /'
    } > "$out" 2>&1
    return 0
}
diag_incidente || true
# --- diag:end ---

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
    # --delete para que el docroot espeje dist exactamente, PERO preservar lo que
    # NO pertenece al build del frontend y vive en el mismo docroot:
    #   .well-known/ → AutoSSL/Let's Encrypt
    #   .htaccess    → routing del SPA (borrarlo rompe el front)
    #   api/         → punto de montaje de Passenger del backend Node
    #                  (URL test.boveda.lols.cl/api) — borrarlo ROMPE la API
    rsync -a --delete \
        --exclude '.well-known/' \
        --exclude '.htaccess' \
        --exclude 'api/' \
        "$REPO_DIR/frontend/dist/" "$FRONT_DEST/"
else
    # Fallback sin rsync: limpiar y copiar, preservando .well-known (AutoSSL),
    # .htaccess (routing del SPA) y api/ (mount de Passenger del backend).
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
