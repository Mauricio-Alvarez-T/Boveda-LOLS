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

# --- lock global:begin — UNA pasada del cron a la vez (2026-09-16) ---
# Los locks de heal-deps/auto-migrate/sanear son POR FUNCIÓN: el tick perdedor se salta esa
# función pero SIGUE hasta la sección de deploy. Con npm ci o migrate cruzando ticks (timeout
# 600 s cada uno, y el cron dispara cada 5 min) dos pasadas podían solaparse sobre el MISMO
# clone: dos `git reset --hard` y dos rsync del mismo árbol, con archivos cambiando bajo el
# rsync de la otra y un orden de escritura del docroot indefinido.
# Cubre el script ENTERO y se libera con `trap EXIT` (también cuando `set -e` mata la pasada).
# Stale a 60 min: por encima del peor caso real (npm ci 10' + migrate 10' + saneo 10' + rsyncs),
# así que solo lo libera un SIGKILL o un reinicio del host, nunca una pasada viva.
LOCK_GLOBAL="$REPO_DIR/.deploy.lock"
if [ -d "$LOCK_GLOBAL" ] && [ -n "$(find "$LOCK_GLOBAL" -maxdepth 0 -mmin +60 2>/dev/null)" ]; then
    echo "$(date '+%F %T') · lock global viejo (>60 min) — lo libero"
    rmdir "$LOCK_GLOBAL" 2>/dev/null || true
fi
if ! mkdir "$LOCK_GLOBAL" 2>/dev/null; then
    echo "$(date '+%F %T') · otra pasada en curso (lock global) — salto este tick"
    exit 0
fi
# El trap se arma DESPUÉS de tomar el lock: armarlo antes haría que el tick perdedor borrara al
# salir el lock del tick que sí lo tiene.
trap 'rmdir "$LOCK_GLOBAL" 2>/dev/null || true' EXIT
# --- lock global:end ---

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

    # 2) Binario de Node: si el configurado no existe O ESTÁ VACÍO (venv
    #    borrado/recreado, o la truncación del incidente 2026-08-24 — mismo caso
    #    que el startup file: 0 bytes con bit +x pasa -x pero no ejecuta nada),
    #    apuntar al nodevenv de MAYOR versión numérica, mínimo 18 (sharp exige
    #    Node >= 18.17; y un venv viejo tampoco tendría los node_modules).
    local nb
    nb="$(sed -n 's/^PassengerNodejs[[:space:]]*"\{0,1\}\([^"[:space:]]*\)"\{0,1\}[[:space:]]*$/\1/p' "$ht" | tail -n1)"
    if [ -n "$nb" ] && { [ ! -x "$nb" ] || [ ! -s "$nb" ]; }; then
        local cand="" best=0 n v
        for n in "$HOME/nodevenv/$(basename "$BACK_DEST")"/*/bin/node; do
            v="${n%/bin/node}"; v="${v##*/}"
            case "$v" in *[!0-9]*) continue ;; esac
            if [ -x "$n" ] && [ "$v" -ge 18 ] && [ "$v" -gt "$best" ]; then best="$v"; cand="$n"; fi
        done
        if [ -n "$cand" ]; then
            sed -i "s|^PassengerNodejs[[:space:]].*|PassengerNodejs \"$cand\"|" "$ht"
            echo "$(date '+%F %T') · heal: node '$nb' no existe/está vacío → $cand"
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
# SYMLINK, pero un SAVE del panel (~10:28 del 25-08) lo dejó como DIRECTORIO real
# PARCIAL (tiene express, no el árbol completo) y los requires siguen resolviendo
# exceljs en la lib del venv, donde falta 'tmp' → crash en el primer require, la
# app nunca llega a listen y Passenger responde 500 tras ~65s.
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

# --- auto-migrate:begin — Migraciones automáticas por cron (PERMANENTE, 2026-08-27) ---
# Generaliza el migrate-once del incidente 2026-08-24/25: el panel de cPanel SIGUE
# sin poder correr scripts (el Selector lanza todo con el npm del venv que el restore
# no devolvió → FileNotFoundError antes de ejecutar nada), así que las migraciones
# se aplican por acá. Dispara cuando la firma (md5 por archivo) de db/migrations
# difiere de la del último migrate EXITOSO (marker con la firma): las migraciones
# llegan solo por deploy, un .sql ya aplicado no se re-ejecuta (schema_migrations)
# y re-correr migrate.js sobre un set aplicado es no-op — firma por CONTENIDO para
# que un .sql corregido in situ dispare de inmediato (y resetee el backoff).
# migrate.js sale con rc!=0 si algo falla — un set que falló reintenta cada 30 min
# hasta pasar (el marker solo se escribe al ÉXITO).
# Diseño defensivo heredado: lock anti-solape + backoff 30 min SOLO tras fallo del
# MISMO set (un set nuevo resetea el backoff) + timeout 600 + jamás tumba el deploy.
# Al aplicar toca tmp/restart.txt (existingCols cachea columnas por proceso) y
# publica UNA línea en el docroot (migrate-status.txt) para verificar por HTTP
# (hosting sin SSH): fecha + OK/FALLO, sin detalle de errores ni credenciales.
run_auto_migrate() {
    local ht="$FRONT_DEST/api/.htaccess"
    if [ ! -f "$ht" ] && grep -q '^PassengerAppRoot' "$FRONT_DEST/.htaccess" 2>/dev/null; then
        ht="$FRONT_DEST/.htaccess"
    fi
    [ -f "$ht" ] || return 0
    local nb
    nb="$(sed -n 's/^PassengerNodejs[[:space:]]*"\{0,1\}\([^"[:space:]]*\)"\{0,1\}[[:space:]]*$/\1/p' "$ht" | tail -n1)"
    # -s además de -x: un bin/node VACÍO con bit de ejecución (la truncación real
    # del incidente 2026-08-24) pasa -x, y execvp+ENOEXEC lo degrada a sh → un
    # "éxito" exit 0 sin migrar nada que dejaría el marker envenenado para siempre.
    { [ -n "$nb" ] && [ -x "$nb" ] && [ -s "$nb" ]; } || return 0
    { [ -f "$BACK_DEST/scripts/migrate.js" ] && [ -d "$BACK_DEST/node_modules/mysql2" ]; } || return 0

    local firma marker="$BACK_DEST/tmp/.migrate-aplicado.lista"
    firma="$(cd "$BACK_DEST/db/migrations" 2>/dev/null && LC_ALL=C md5sum *.sql 2>/dev/null | LC_ALL=C sort)"
    [ -n "$firma" ] || return 0
    if [ -f "$marker" ] && [ "$firma" = "$(cat "$marker")" ]; then
        return 0
    fi

    # heal-deps instalando (su npm ci puede cruzar ticks): migrar contra un
    # node_modules a medio escribir falla y quema el backoff de 30 min — posponer.
    if [ -d "$BACK_DEST/tmp/.deps-heal.lock" ]; then
        echo "$(date '+%F %T') · auto-migrate: heal-deps en curso (lock) — pospongo"
        return 0
    fi

    mkdir -p "$BACK_DEST/tmp"
    local mlog="$BACK_DEST/tmp/migrate-auto.log"
    local intento="$BACK_DEST/tmp/.migrate-intento.lista"
    # Backoff: mismo set que el último intento Y log de hace <30 min → esperar.
    if [ -f "$intento" ] && [ "$firma" = "$(cat "$intento")" ] && [ -n "$(find "$mlog" -mmin -30 2>/dev/null)" ]; then
        echo "$(date '+%F %T') · auto-migrate: intento reciente del mismo set (<30 min) — backoff"
        return 0
    fi
    local lock="$BACK_DEST/tmp/.migrate-auto.lock"
    if [ -d "$lock" ] && [ -n "$(find "$lock" -maxdepth 0 -mmin +30 2>/dev/null)" ]; then
        rmdir "$lock" 2>/dev/null || true
    fi
    if ! mkdir "$lock" 2>/dev/null; then
        echo "$(date '+%F %T') · auto-migrate: otro tick migrando (lock) — salto"
        return 0
    fi

    printf '%s\n' "$firma" > "$intento"
    echo "$(date '+%F %T') · auto-migrate: migraciones nuevas — corriendo migrate.js con $nb (log: tmp/migrate-auto.log)"
    local rc=0 tmo=""
    command -v timeout >/dev/null 2>&1 && tmo="timeout 600"
    ( cd "$BACK_DEST" && $tmo "$nb" scripts/migrate.js ) > "$mlog" 2>&1 || rc=$?
    rmdir "$lock" 2>/dev/null || true
    local resumen
    resumen="$(tail -n 1 "$mlog" 2>/dev/null | tr -d '\r')"
    # Éxito = rc 0 Y salida no vacía: migrate.js siempre imprime; un node roto
    # que "termina bien" mudo NO es un migrate exitoso (defensa en profundidad
    # del -s de arriba) — cae al camino FALLO y el retry lo toma al sanar.
    if [ "$rc" = "0" ] && [ -n "$resumen" ]; then
        printf '%s\n' "$firma" > "$marker"
        rm -f "$intento"
        date > "$BACK_DEST/tmp/restart.txt"
        echo "$(date '+%F %T') · auto-migrate: OK — $resumen (Passenger reiniciado)"
        printf '%s · OK · %s\n' "$(date '+%F %T')" "$resumen" > "$FRONT_DEST/migrate-status.txt" 2>/dev/null || true
    else
        echo "$(date '+%F %T') · auto-migrate: falló (rc=$rc) — ver tmp/migrate-auto.log; reintento en 30 min"
        printf '%s · FALLO rc=%s — revisar tmp/migrate-auto.log del backend\n' "$(date '+%F %T')" "$rc" > "$FRONT_DEST/migrate-status.txt" 2>/dev/null || true
    fi
    return 0
}
run_auto_migrate || echo "$(date '+%F %T') · auto-migrate: falló (rc=$?) — no fatal"
# --- auto-migrate:end ---

# --- sanear-datos:begin — Datos ficticios en staging (PERMANENTE, 2026-09-15) ---
# Staging es una web pública y llegó a tener trabajadores REALES (RUT, domicilio, salud, cuenta
# bancaria) porque el único procedimiento para poblarlo era importar tablas de producción. Este
# bloque es la red de seguridad: cada tick revisa que no haya trabajadores fuera del bloque de RUT
# ficticios (44.000.000-44.000.999) y, si los hay, los purga junto con sus rastros (solicitudes,
# desvinculaciones, logs, archivos de uploads) y apaga el correo saliente.
#
# Gracia de 48 h sobre created_at: lo que el dueño crea a mano mientras hace QA sobrevive la
# sesión; una importación desde producción llega con created_at antiguo y cae igual.
#
# SOLO EXISTE EN EL SCRIPT DE STAGING. cpanel-deploy-prod.sh no lo tiene y no debe tenerlo.
# El script además se niega a correr si DB_NAME es la base de producción o no dice test/staging/dev.
# Mismo diseño defensivo que auto-migrate: lock, timeout, jamás tumba el deploy, y una línea por
# HTTP en el docroot (datos-status.txt) para verificar sin SSH.
run_sanear_datos() {
    local ht="$FRONT_DEST/api/.htaccess"
    if [ ! -f "$ht" ] && grep -q '^PassengerAppRoot' "$FRONT_DEST/.htaccess" 2>/dev/null; then
        ht="$FRONT_DEST/.htaccess"
    fi
    [ -f "$ht" ] || return 0
    local nb
    nb="$(sed -n 's/^PassengerNodejs[[:space:]]*"\{0,1\}\([^"[:space:]]*\)"\{0,1\}[[:space:]]*$/\1/p' "$ht" | tail -n1)"
    { [ -n "$nb" ] && [ -x "$nb" ] && [ -s "$nb" ]; } || return 0
    { [ -f "$BACK_DEST/scripts/sanear_staging.js" ] && [ -d "$BACK_DEST/node_modules/mysql2" ]; } || return 0

    local lock="$BACK_DEST/tmp/.sanear-datos.lock"
    if [ -d "$lock" ] && [ -n "$(find "$lock" -maxdepth 0 -mmin +30 2>/dev/null)" ]; then
        rmdir "$lock" 2>/dev/null || true
    fi
    if ! mkdir "$lock" 2>/dev/null; then
        echo "$(date '+%F %T') · sanear-datos: otro tick en curso (lock) — salto"
        return 0
    fi

    mkdir -p "$BACK_DEST/tmp"
    local slog="$BACK_DEST/tmp/sanear-datos.log" rc=0 tmo=""
    command -v timeout >/dev/null 2>&1 && tmo="timeout 600"
    ( cd "$BACK_DEST" && SANEO_STAGING=1 $tmo "$nb" scripts/sanear_staging.js --aplicar --sembrar --auto ) > "$slog" 2>&1 || rc=$?
    rmdir "$lock" 2>/dev/null || true

    local resumen
    resumen="$(grep -m1 '^RESUMEN' "$slog" 2>/dev/null | tr -d '\r' | sed 's/^RESUMEN · //')"
    [ -n "$resumen" ] || resumen="sin resumen"
    if [ "$rc" = "0" ]; then
        echo "$(date '+%F %T') · sanear-datos: $resumen"
        printf '%s · %s\n' "$(date '+%F %T')" "$resumen" > "$FRONT_DEST/datos-status.txt" 2>/dev/null || true
    else
        echo "$(date '+%F %T') · sanear-datos: falló (rc=$rc) — ver tmp/sanear-datos.log"
        printf '%s · FALLO rc=%s — revisar tmp/sanear-datos.log del backend\n' "$(date '+%F %T')" "$rc" > "$FRONT_DEST/datos-status.txt" 2>/dev/null || true
    fi
    return 0
}
# Igual que auto-migrate: se llama en CADA tick, no solo cuando hay build nuevo. El bloque se
# describe a sí mismo como "cada tick revisa", pero hasta el 2026-09-16 su única llamada estaba
# DESPUÉS del `exit 0` de "sin cambios" → la red de seguridad corría solo en los ticks CON
# deploy. Un fin de semana sin pushes dejaba datos reales importados a staging expuestos en una
# web pública hasta el lunes. Con `--auto` y sin foráneos el script sale en una consulta.
run_sanear_datos || echo "$(date '+%F %T') · sanear-datos: falló (rc=$?) — no fatal"
# --- sanear-datos:end ---

# --- helpers del deploy ---
# rsync corre bajo `set -e`: cualquier rc≠0 aborta la pasada a mitad del docroot. rc=24
# ("partial transfer due to vanished source files") es benigno — algo desapareció del ORIGEN
# mientras copiaba — y con el lock global ya casi no puede pasar, pero tolerarlo evita que un
# caso inofensivo deje el deploy por la mitad. Cualquier otro rc (23 = fallos de transferencia,
# 12 = protocolo, …) sigue siendo FATAL a propósito: ahí el destino sí puede quedar mal, y lo
# que queremos es que la pasada muera SIN escribir el testigo para que el próximo tick la rehaga.
rsync_deploy() {
    local rc=0
    rsync "$@" || rc=$?
    if [ "$rc" = "24" ]; then
        echo "$(date '+%F %T') · rsync: rc=24 (archivos del origen desaparecieron) — tolerado"
        return 0
    fi
    return "$rc"
}

# Una línea por HTTP con el build que REALMENTE está corriendo (hosting sin SSH):
# https://test.boveda.lols.cl/deploy-status.txt. migrate-status.txt dice cómo fue la migración y
# datos-status.txt cómo fue el saneo, pero ninguno decía QUÉ build hay desplegado. Se escribe
# "EN CURSO" antes de tocar el docroot y "OK" al final: un "EN CURSO" con hora vieja es la señal
# de una pasada que murió a mitad. El repo es público → el SHA y el asunto del commit no son
# información sensible.
estado_deploy() {
    printf '%s · %s · %s %s · %s\n' \
        "$(date '+%F %T')" "$1" "$BRANCH" "${2:0:7}" \
        "$(git log -1 --format=%s "$2" 2>/dev/null || echo '-')" \
        > "$FRONT_DEST/deploy-status.txt" 2>/dev/null || true
}

# 1) Traer lo último de la rama de build
git fetch origin "$BRANCH" --quiet
REMOTE="$(git rev-parse "origin/$BRANCH")"

# Lo que decide si hay algo que hacer es el TESTIGO del último deploy COMPLETO, no HEAD.
# Antes se comparaba HEAD con origin, y a HEAD lo mueve el `git reset --hard` de abajo ANTES de
# los rsync, las migraciones, el saneo y el restart. Si una pasada moría en ese tramo (un rsync
# con rc≠0 bajo `set -e`, el proceso matado, el host reiniciado), HEAD ya estaba en el SHA nuevo
# y TODOS los ticks siguientes caían en "sin cambios — nada que desplegar" PARA SIEMPRE: el
# docroot podía quedar con frontend nuevo y backend/esquema viejos, y el cron lo reportaba como
# desplegado. Solo lo sacaba un humano empujando otro commit.
# El testigo se escribe recién al final de la pasada, así que una pasada incompleta se reintenta
# sola al tick siguiente. Repetir es seguro: los rsync son idempotentes, migrate.js no re-aplica
# lo que ya está en schema_migrations, el saneo con --auto no hace nada si no hay foráneos y el
# restart es tocar un archivo.
MARCA="$REPO_DIR/.deploy-ultimo-ok"
DESPLEGADO="$(cat "$MARCA" 2>/dev/null || true)"

if [ "$DESPLEGADO" = "$REMOTE" ]; then
    echo "$(date '+%F %T') · sin cambios ($REMOTE) — nada que desplegar"
    exit 0
fi

if [ "$(git rev-parse HEAD)" = "$REMOTE" ]; then
    if [ -z "$DESPLEGADO" ]; then
        echo "$(date '+%F %T') · primera pasada con testigo — redesplegando $REMOTE para partir de un estado conocido"
    else
        echo "$(date '+%F %T') · el árbol ya estaba en $REMOTE pero el deploy anterior no terminó — lo rehago"
    fi
fi

echo "$(date '+%F %T') · desplegando $REMOTE (último completo: ${DESPLEGADO:-ninguno})"
git reset --hard "origin/$BRANCH" --quiet

# 2) Frontend: copiar dist prebuildeado → docroot de staging
mkdir -p "$FRONT_DEST"
estado_deploy "EN CURSO" "$REMOTE"
if command -v rsync >/dev/null 2>&1; then
    # --delete para que el docroot espeje dist exactamente, PERO preservar lo que
    # NO pertenece al build del frontend y vive en el mismo docroot:
    #   .well-known/ → AutoSSL/Let's Encrypt
    #   .htaccess    → routing del SPA (borrarlo rompe el front)
    #   api/         → punto de montaje de Passenger del backend Node
    #                  (URL test.boveda.lols.cl/api) — borrarlo ROMPE la API
    #   migrate-status.txt → estado del último auto-migrate (lo escribe el bloque de arriba)
    #   datos-status.txt   → estado del último saneo de datos ficticios (run_sanear_datos)
    #   deploy-status.txt  → qué build está desplegado (estado_deploy) — se escribe ANTES de
    #                        este rsync, así que sin el exclude el --delete lo borraría
    rsync_deploy -a --delete \
        --exclude '.well-known/' \
        --exclude '.htaccess' \
        --exclude 'migrate-status.txt' \
        --exclude 'datos-status.txt' \
        --exclude 'deploy-status.txt' \
        --exclude 'api/' \
        "$REPO_DIR/frontend/dist/" "$FRONT_DEST/"
else
    # Fallback sin rsync: limpiar y copiar, preservando .well-known (AutoSSL),
    # .htaccess (routing del SPA), api/ (mount de Passenger del backend) y los tres
    # *-status.txt que se publican por HTTP.
    find "$FRONT_DEST" -mindepth 1 -maxdepth 1 ! -name '.well-known' ! -name '.htaccess' ! -name 'migrate-status.txt' ! -name 'datos-status.txt' ! -name 'deploy-status.txt' ! -name 'api' -exec rm -rf {} +
    cp -a "$REPO_DIR/frontend/dist/." "$FRONT_DEST/"
fi

# 3) Backend: copiar código (sin node_modules/tmp/uploads/.env — se preservan en destino)
mkdir -p "$BACK_DEST"
if command -v rsync >/dev/null 2>&1; then
    rsync_deploy -a \
        --exclude 'node_modules/' \
        --exclude 'tmp/' \
        --exclude 'uploads/' \
        --exclude '.env*' \
        "$REPO_DIR/backend/" "$BACK_DEST/"
else
    cp -a "$REPO_DIR/backend/." "$BACK_DEST/"
fi

# 3a) Espejo EXACTO de db/migrations (el rsync de arriba no lleva --delete porque
#     preserva uploads/.env/tmp): sin esto, un .sql borrado o renombrado en el repo
#     sobreviviría en el destino — la firma lo seguiría incluyendo y, si era el que
#     fallaba, el retry quedaría en loop perpetuo (y un renombre con el mismo
#     prefijo NNN activaría el guard anti-duplicados de migrate.js, bloqueando TODO
#     el set). Espejar solo esta subcarpeta es seguro: ahí no viven datos.
if command -v rsync >/dev/null 2>&1; then
    rsync_deploy -a --delete "$REPO_DIR/backend/db/migrations/" "$BACK_DEST/db/migrations/"
else
    rm -rf "$BACK_DEST/db/migrations"
    cp -a "$REPO_DIR/backend/db/migrations" "$BACK_DEST/db/"
fi

# 3b) Migraciones del backend recién copiado — mismo tick del deploy (la llamada
#     inicial de auto-migrate corrió ANTES del rsync, con la firma anterior).
run_auto_migrate || echo "$(date '+%F %T') · auto-migrate: falló (rc=$?) — no fatal"
run_sanear_datos || echo "$(date '+%F %T') · sanear-datos: falló (rc=$?) — no fatal"

# 4) Reiniciar Passenger
mkdir -p "$BACK_DEST/tmp"
date > "$BACK_DEST/tmp/restart.txt"

# 5) Testigo del deploy COMPLETO (ver el paso 1): recién ahora el próximo tick puede decir
#    "sin cambios". Si la pasada murió antes de esta línea, el tick siguiente la rehace entera.
printf '%s\n' "$REMOTE" > "$MARCA"
estado_deploy "OK" "$REMOTE"

echo "$(date '+%F %T') · deploy OK → $REMOTE"
