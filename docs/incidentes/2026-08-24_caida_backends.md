# Incidente 2026-08-24 → 26 — Caída de backends: metodologías de diagnóstico

> **Qué es este documento**: el catálogo de MÉTODOS que se usaron para diagnosticar y
> destrabar la caída de los backends de prod y staging entre el 24 y el 26 de agosto
> de 2026. **No es un post-mortem de causas**: deliberadamente no emite conclusiones ni
> veredictos de causa raíz — los hechos del incidente aparecen solo como ejemplo de
> aplicación de cada método. El propósito es que la PRÓXIMA caída se diagnostique en
> minutos siguiendo estas recetas, sea cual sea su causa.
>
> **Contexto factual mínimo**: 24-ago ~18:00 UTC ambos backends (boveda.lols.cl y
> test.boveda.lols.cl) dejaron de responder con la página de error de Phusion
> Passenger; el hosting hizo un restore de backup la madrugada del 25; los servicios
> quedaron estables el 25 ~15:20 UTC. Trabajaron en paralelo dos sesiones de IA (la de
> Mauricio y la de Marcos) más la IA de cPanel como manos dentro del panel.
>
> Documento COLABORATIVO: la Parte 1 la escribió la sesión de Mauricio; la Parte 2 la
> escribió la sesión de Marcos.

---

## Índice rápido: señal → método

| Señal observable | Método |
|---|---|
| 500 con página HTML "We're sorry… could not be started" | 1.1, 1.6 |
| 500 solo al usar un feature nuevo | 1.2 |
| "¿Fue un commit?" — sospecha de regresión | 1.3 |
| ¿El deploy llegó al servidor? ¿Apache o backend? | 1.4 |
| Hace falta mirar/tocar el servidor y no hay SSH | 1.5 |
| Los logs de la app están VACÍOS | 1.6 |
| El hosting restauró un backup — ¿qué retrocedió? | 1.7 |
| El panel de cPanel no puede ejecutar nada | 1.8 |
| Hay que ver el estado interno del servidor muchas veces seguidas | 2.1 |
| Un automatismo debe tocar config que el panel también reescribe | 2.2 |
| Un bloque de auto-reparación corre pero no repara nada | 2.3 |
| La herramienta oficial de reparación está bloqueada por el propio daño | 2.4 |
| Se va a activar un automatismo que escribe o borra solo en producción | 2.5 |

---

## Parte 1 — Metodologías (sesión Mauricio)

### 1.1 Leer la FORMA del error antes que el contenido

**Señal**: un endpoint devuelve 500. **Pregunta que responde**: ¿falla el endpoint o
no está corriendo el proceso?

- Mirar `Content-Type` y el cuerpo: el errorHandler de Express de este backend
  responde **JSON**; la página **HTML** de Passenger («We're sorry, but something went
  wrong: Web application could not be started», ~4.4 KB constantes) significa que el
  SPAWN del proceso falló — el código del endpoint ni siquiera se ejecutó.
- Corolario: con esa página, buscar el bug en el endpoint es tiempo perdido; el
  problema está en el arranque (deps, .env, binario de Node, DB al boot — ver 1.6).
- La página trae un **Error ID** que apunta al log de Passenger (accesible solo por
  el hosting); en modo producción NO muestra el stack.

### 1.2 Aislar código vs infraestructura reproduciendo en ancho

**Señal**: el error aparece al usar un feature recién deployado — el sospechoso obvio.
**Pregunta**: ¿es el feature o se cayó todo?

- Con la sesión del navegador integrado (login lo hace el humano; el token JWT vive en
  `localStorage.sgdl_token` y **no sale del navegador**), disparar por `fetch` in-page:
  1) el endpoint sospechoso con TODAS las combinaciones de parámetros,
  2) endpoints básicos sin relación (`/api/obras`, `/api/asistencias/estados`,
     `/api/auth/me`).
- Si TODO devuelve lo mismo (acá: 500 HTML), el feature queda descartado en un solo
  paso. En este incidente el filtro nuevo de Consultas era el sospechoso y resultó
  inocente: hasta `/api/obras` estaba caído.

### 1.3 Bisección temporal con git

**Señal**: sospecha de regresión por commit. **Pregunta**: ¿pudo el código o el deploy
causar esto?

- Acotar la ventana `[último boot bueno CONFIRMADO → primera falla]` con hechos, no
  recuerdos (un QA que funcionó, un health 200 con timestamp).
- `git log A..B --format='%h %an %ad %s'` → lista de commits con autor en la ventana.
- Descartes mecánicos y baratos, en orden:
  - `node --check` masivo sobre `backend/` (sintaxis rota; ojo con falsos positivos
    de JSX dentro de `node_modules`).
  - `git diff A..B -- backend/package.json` (¿deps nuevas que el servidor no tiene?).
  - `git ls-tree origin/deploy-prod backend/` (¿la rama de build arrastra
    `node_modules` u otra entrada que pueda pisar algo en destino?).
  - Leer `scripts/cpanel-deploy-*.sh`: el rsync del backend va **sin `--delete`** →
    el deploy no puede borrar nada del destino; los excludes (`node_modules/`, `tmp/`,
    `uploads/`, `.env*`) dicen qué se preserva.
- Contraprueba reina: si el mismo commit **llegó a servir tráfico** alguna vez
  (respuesta correcta observada), no existe boot-crash determinista de código.

### 1.4 Salud por HTTP sin SSH

**Señal**: cualquier momento del incidente. **Pregunta**: ¿qué capa está viva y qué
versión corre?

- `curl -sk -m 30 -o /dev/null -w "HTTP %{http_code} (%{time_total}s)" URL` contra:
  - `/api/health` → backend (endpoint público, sin auth).
  - `/` (docroot) → Apache/frontend (si esto responde y health no, es el backend).
- El TIEMPO también es señal: página de Passenger instantánea ≠ timeout de ~65s
  (spawn que se cuelga/crashea tarde) ≠ respuesta en milisegundos.
- ¿El cron de deploy aplicó?: comparar el bundle
  `git show origin/deploy-prod:frontend/dist/index.html | grep -o 'assets/index-[^"]*\.js'`
  contra el mismo grep sobre `curl https://boveda.lols.cl/` — hash igual = deploy
  aplicado.
- Workflows: `gh run list --workflow deploy-cpanel.yml -L 3` (verde solo prueba que la
  RAMA se publicó; el servidor aplica por cron hasta 5 min después).

### 1.5 Hipótesis falsables delegadas a la IA de cPanel

**Señal**: hace falta mirar dentro del servidor (sin SSH; el humano tiene cPanel).
**Pregunta**: ¿cómo obtener datos confiables por manos de terceros?

- Redactar el encargo como **hipótesis falsable con criterios exactos**: qué mirar,
  qué umbral decide, qué NO tocar, y qué copiar de vuelta. Ejemplo real: "SHOW FULL
  PROCESSLIST; matar SOLO (a) ALTER TABLE en 'Waiting for table metadata lock',
  (b) Sleep > 600s; copiar el listado antes y después; NO correr migrate".
- **Aceptar la refutación con datos**: la hipótesis "MySQL trabado" murió porque la
  IA de cPanel verificó con método propio (el processlist de phpMyAdmin requiere el
  privilegio PROCESS que el usuario del panel no tiene → verificó por SELECT con
  `lock_wait_timeout=5` y por `Threads_connected` vs `max_user_connections`).
  Una hipótesis refutada con evidencia vale más que una confirmada sin ella.
- Toda instrucción a la IA de cPanel lleva: contexto de 1 línea, pasos numerados,
  prohibiciones explícitas y "REPORTAR: …" con la lista exacta.

### 1.6 Mapear síntoma → etapa del boot leyendo `index.js`

**Señal**: la app no arranca y hay que saber EN QUÉ PUNTO muere. El boot de este
backend tiene etapas con huellas distintas:

| Huella | Etapa donde murió |
|---|---|
| `logs/` VACÍO y sin `startup_debug.log` nuevo | Antes del PRIMER `require()` (deps/`node_modules`/binario de Node) — los handlers de uncaught se registran en las primeras líneas de `index.js`, si ni eso corrió no hay rastro |
| `startup_debug.log` con stack `[UNCAUGHT]` | Un `require()` intermedio falló (módulo/dep transitiva ausente — el stack dice cuál) |
| Log con `[startup] versionService.init falló` | La query a MySQL del boot falló — `index.js` hace `versionService.init()` (SELECT a `roles`) ANTES de `app.listen` y sale con `exit(1)` si no puede |
| App arriba pero un endpoint 500 JSON | Ya no es boot: es el endpoint (volver a 1.2) |

- Este mapa se construye UNA vez leyendo el boot path (`index.js` líneas iniciales +
  bloque final) y ahorra horas: cada síntoma apunta a una familia de causas distinta.

### 1.7 Forense de un restore de backup

**Señal**: el hosting restauró un backup. **Pregunta**: ¿QUÉ retrocedió exactamente
(archivos, BD, ambos) y qué datos se perdieron?

- **Ids como testigos**: comparar `MAX(id)` actual de una tabla contra ids
  OBSERVADOS antes del restore (de QA, logs o pantallas). `MAX(id)` menor que un id
  que viste = la BD retrocedió. (Acá: staging `MAX(id)=16960` vs filas 16961-63
  creadas en QA el día anterior.)
- **Volumen por fecha**: `SELECT fecha, COUNT(*) … GROUP BY fecha` alrededor del día
  del incidente y comparar contra el volumen diario normal (~170-190 filas hábiles de
  asistencia) — un día con 3 filas donde debía haber 190 = datos de ese día perdidos.
- **`schema_migrations`**: las últimas filas dicen hasta qué migración quedó la BD —
  si faltan migraciones que ya se habían corrido, el restore las des-aplicó.
- No confiar en "el restore fue solo de archivos" sin estas tres pruebas.

### 1.8 Canal de ejecución alternativo cuando el panel no ejecuta

**Señal**: "Setup Node.js App → Run JS script / NPM Install" falla ANTES de ejecutar
(p.ej. `FileNotFoundError: …/nodevenv/<app>/20/bin/npm` — el Selector de CloudLinux
lanza todo con el npm del venv). **Pregunta**: ¿cómo correr algo en el servidor igual?

- El **cron de deploy** ya ejecuta bash en el servidor cada 5 min y es self-healing
  (pre-carga el `.sh` nuevo antes de correrlo) → un bloque en el script corre en el
  próximo tick sin tocar el panel.
- Patrón de bloque seguro (ver `run_migrate_once`/`heal_deps` en
  `scripts/cpanel-deploy-*.sh`): **marker al éxito** (no se repite) + **lock-dir**
  anti-solape entre ticks + **backoff** de 30 min si falló + `timeout` + log propio en
  `tmp/`. Ejecutar con el **node del `.htaccess`** (`PassengerNodejs`) directamente —
  `node scripts/migrate.js` no necesita npm (carga su `.env` por ruta absoluta).
- Para LEER resultados sin SSH: publicar el estado en un archivo del docroot y leerlo
  por HTTP (patrón `_diag-incidente.txt` — ver Parte 2).
- Evolución posterior: el bloque run-once se convirtió en `auto-migrate` permanente
  del cron (f83cdbd).

---

## Parte 2 — Metodologías (sesión Marcos)

### 2.1 Publicar el diagnóstico por HTTP cuando hay que mirar muchas veces

**Señal**: no hay SSH, el estado interno del servidor hay que consultarlo **repetidamente**
(cada pocos minutos, durante horas) y cada consulta cuesta un round-trip por manos de
terceros. **Pregunta que responde**: ¿cómo tener un tablero de estado del servidor que se
actualice solo y se lea desde afuera?

- Patrón: el **cron de deploy** (que ya corre cada 5 min — ver 1.8) escribe un archivo de
  texto plano en el docroot; se lee con `curl https://<host>/_diag-incidente.txt`. Cada
  tick lo reescribe → siempre trae estado de hace ≤5 min sin pedirle nada a nadie.
- Diseñar cada campo como **respuesta binaria a una pregunta concreta**, no como volcado:

  | Campo | Pregunta que contesta |
  |---|---|
  | `htaccess=presente mtime=…` + las líneas `Passenger*` | ¿Qué config rige HOY? ¿La tocó alguien recién? |
  | `node_bin=OK\|NO_EXISTE` | ¿El `PassengerNodejs` del `.htaccess` es ejecutable? |
  | `venvs_app`, `venvs_todos` (`ls -m`) | ¿Qué virtualenvs existen realmente? |
  | `index.js=OK\|FALTA`, `env=OK\|FALTA` | ¿Está desplegado el backend y su `.env`? |
  | `node_modules=OK\|FALTA\|ROTO_O_SYMLINK_COLGANDO` | ¿Puede resolver dependencias? |
  | `selector=disponible\|no` | ¿Existe el CLI del vendor en el entorno del cron? |
  | `sysnode <ruta> = vXX` por candidato | ¿Qué intérpretes hay fuera del venv? (ver 2.4) |
  | `mysql=OK\|FALLA` | ¿La BD acepta las credenciales del `.env`? |
  | `log_<archivo>_mtime` + `tail` de los logs de arranque | ¿Murió en el boot y dónde? (ver 1.6) |
  | `deploylog_tail` | ¿Qué hizo el cron en los últimos ticks? |

- **Regla de secretos**: el diag prueba la BD leyendo el `.env` **solo en memoria** y publica
  únicamente `OK`/`FALLA`. Nunca imprimir valores de `.env`, ni variables de entorno, ni
  rutas con tokens: el archivo vive en una **URL pública**.
- **Es temporal por definición**: publica estado interno sin autenticación. Su retiro entra
  en el DoD del incidente (bloque delimitado `# --- diag:begin/end ---` para que quitarlo
  sea un solo corte).
- **Gotcha 1 — el deploy lo borra**: el `rsync --delete` del frontend limpia el docroot, así
  que un archivo escrito una sola vez desaparece en el siguiente deploy. Por eso se
  **reescribe en cada tick** (la alternativa es excluirlo del `--delete`).
- **Gotcha 2 — validar el CONTENIDO, no el HTTP 200**: con el rewrite del SPA, pedir un
  archivo inexistente devuelve **200 con el `index.html`**. El chequeo correcto es que la
  respuesta empiece por el campo esperado (`case "$out" in ts=*)`), no que el código sea 200.
- El diag **crece con las preguntas**: cada vez que apareció una duda nueva se le agregó un
  campo (los `sysnode` disponibles, colas de log más largas, el estado del bloque de
  reparación). Costo de agregar un campo: un push. Costo de no tenerlo: un round-trip humano
  por cada consulta.

### 2.2 Reparación guiada por verificación (`heal_passenger`)

**Señal**: una config crítica la reescriben **dos actores** (el panel del hosting y
nosotros) y hay que repararla automáticamente sin pelearse con el otro. **Pregunta que
responde**: ¿cómo automatizar una reparación sin que cause más daño del que arregla?

- **Cada reparación se dispara por una verificación, no por una suposición.** Una condición
  observable por reparación, y si no se puede verificar rota, no se toca:

  | Se repara | Solo si |
  |---|---|
  | `PassengerStartupFile` → `index.js` | el archivo apuntado **no existe o está vacío** (`[ ! -s ]`) **y** `index.js` sí tiene contenido |
  | `PassengerNodejs` → otro intérprete | el binario configurado **no es ejecutable** (`[ ! -x ]`) |
  | symlink `node_modules` | **no hay nada** en la ruta (`[ ! -e ]`, que tampoco ve un symlink colgando) **y** la lib destino tiene paquetes reales |

- **No completar lo ausente**: si la línea `PassengerStartupFile` no está, se deja así — el
  default del runtime puede ser correcto. Reparar ≠ opinar.
- **`[ ! -s ]` en vez de `[ ! -f ]`**: un archivo de **0 bytes existe** y pasa cualquier
  check de existencia, pero como módulo exporta `{}` y el servidor arranca sin app. Los
  chequeos de existencia mienten; los de contenido no.
- **Guardia anti-carrera**: si el archivo fue modificado hace menos de 2 minutos
  (`find "$f" -mmin -2`), saltar el tick. Un guardado a medias del panel no debe encontrarse
  con el heal escribiendo encima. `sed -i` es atómico (tmp+rename), lo que evita el resto.
- **Jamás tumbar el canal que repara**: la llamada va con `|| echo "…falló, no fatal"`. En un
  hosting sin SSH ese cron es el único canal de reparación; si el heal aborta el script, se
  pierde también el deploy. (Bajo `set -euo pipefail`, además, un `sed | head` puede morir por
  SIGPIPE y matar el script entero: el `||` desactiva `-e` dentro de la función.)
- **Silencio en estado sano**: solo si algo cambió (`changed=1`) se toca `tmp/restart.txt`.
  Un automatismo que reinicia "por las dudas" en cada tick es un incidente esperando.
- **No asumir topología entre entornos**: prod y staging tenían el bloque Passenger en rutas
  distintas (`<docroot>/api/.htaccess` vs el `.htaccess` del docroot, herencia de cómo se creó
  cada app). El heal busca la primera y cae a la segunda si contiene el bloque; asumir una
  sola ruta hacía que en un entorno el heal solo registrara "FALTA el archivo" indefinidamente.

### 2.3 Probe-driven en vez de guard por topología (`npmfix` → `heal-deps`)

**Señal**: un bloque de auto-reparación **corre en cada tick pero no repara nada**, y no deja
ni una línea en el log. **Pregunta que responde**: ¿por qué un automatismo aparentemente
correcto no actúa?

- **Primero: buscar los `return 0` silenciosos.** Una salida temprana sin log es
  indistinguible de "no hacía falta actuar". Regla: **todo camino de salida o loguea, o
  publica su estado** — en este incidente lo que delató el problema fue un campo del diag
  (`npmfix_marker=NO`), no el log.
- **El fallo, como ejemplo de método**: el guard exigía una **topología** — que
  `node_modules` fuera un symlink (`[ -L ]`). Cuando quedó como directorio real *parcial*, el
  guard salía en silencio. Se estaba verificando la **forma** del recurso, no su **función**.
- **Rediseño probe-driven**: en vez de inspeccionar estructura, **provocar el comportamiento**
  y observar si funciona — cargando los deps de verdad con el intérprete que usa el servidor:

  ```
  "$node_del_htaccess" -e 'for (const d of Object.keys(require("./package.json").dependencies)) require(d)'
  ```

  Un solo chequeo detecta symlink colgando, directorio parcial, dependencia transitiva
  ausente y binding nativo incompatible — **sin enumerar ninguno de esos casos**.
- **Regla general transferible**: verificar el **efecto**, no la causa presunta.
  `[ -d node_modules/express ]` responde "existe la carpeta"; `require("express")` responde
  "la app puede arrancar", que es la pregunta que importa. Todo guard escrito sobre una
  estructura asumida caduca cuando otro actor cambia esa estructura.
- **Andamiaje obligatorio** para un bloque que repara solo:
  - **lock-dir** anti-solape (`mkdir` es atómico) con liberación del lock añejo por `mmin`:
    una instalación puede tardar más que el intervalo del cron.
  - **backoff por `mtime` del log** (p.ej. 30 min) en vez de marker de una sola pasada: un
    marker deja el fix muerto tras un fallo transitorio de red; el backoff reintenta sin
    martillar.
  - **no-op silencioso en estado sano**: el probe pasa y el bloque no hace nada.
  - `timeout` cuando esté disponible, invocado de forma condicional
    (`command -v timeout >/dev/null && tmo="timeout 600"`).

### 2.4 Romper el bucle "solo el proveedor puede arreglarlo"

**Señal**: la herramienta oficial de reparación **está bloqueada por el mismo daño que
debería reparar** (p.ej. el panel valida la app antes de operar y responde
`No such application`), y no hay Terminal ni CLI del vendor. **Pregunta que responde**:
¿queda algo del lado usuario, o solo esperar al hosting?

- **Preguntar qué necesita el runtime, no qué provee el vendor.** El servidor de aplicaciones
  no necesita el virtualenv del panel: necesita **un binario ejecutable** y **un árbol de
  módulos**. Ambas cosas pueden existir fuera de la herramienta rota.
- **Inventariar primitivas antes de rendirse**: publicar en el diag qué hay disponible
  (`ls -m /opt/alt`, y `node -v` real de cada candidato) convierte "¿habrá otro node?" en un
  dato. Lo mismo con `command -v` de cada binario que el plan necesite.
- **Aplicar el bypass con degradación explícita**: elegir el candidato de la **misma versión
  mayor** que las librerías instaladas, dejar en el log que es temporal y anotar la condición
  de reversión. Un parche que no dice cómo revertirse se vuelve permanente por olvido.
- **Distinguir "borrado" de "desvinculado" ANTES de pedir una restauración**: si el `mtime`
  de un directorio está intacto y solo cambió el `ctime`, **nadie borró archivos adentro** —
  cambió la metadata del inodo (un mapeo o montaje que se deshizo). Es la diferencia entre
  pedirle al hosting "restauren mis archivos" (restore que puede retroceder datos — ver 1.7)
  y "reconstruyan el mapeo". El ticket al proveedor mejora porque llega con la hipótesis
  fácil ya descartada.
- El bypass no reemplaza al ticket: **corre en paralelo**. Restablece el servicio mientras el
  proveedor resuelve lo que solo él puede tocar.

### 2.5 Verificación adversarial antes de landear un automatismo

**Señal**: se va a activar un bloque que **escribe o borra solo, en producción, cada pocos
minutos, sin nadie mirando**. **Pregunta que responde**: ¿qué hace este código en los casos
que no pensé?

- **Enumerar los estados posibles del recurso ANTES de escribir el guard.** Para
  `node_modules`: symlink sano / symlink colgando / directorio real completo / directorio real
  **parcial** / ausente. Un guard que contempla dos de esos cinco falla en silencio en los
  otros tres (ver 2.3).
- **Revisores independientes con evidencia, no opinión**: cada objeción debe venir con el
  caso concreto que la dispara y, si se puede, un sandbox que lo reproduzca. "Esto podría
  fallar" no es accionable; "con el archivo en 0 bytes toma esta rama y no repara" sí lo es.
- **Preguntas que pagan siempre**: ¿qué pasa si corre dos veces a la vez? ¿si el archivo está
  a medio escribir? ¿si el disco está lleno o la cuota agotada? ¿puede entrar en bucle de
  reescritura+reinicio? ¿pisa algo que otro actor legítimo escribió recién?
- **Guardias mínimas para cualquier bloque que borre**: que el borrado sea siempre del
  **propio artefacto** (`.tmp`, el lock propio), nunca de rutas del usuario; y que un borrado
  sobre un symlink **no siga al destino** (`rm -f` sobre el enlace — nunca `rm -rf` sobre la
  ruta, que vacía la carpeta apuntada).
- **Cambio mínimo bajo presión**: durante una caída la tentación es reescribir el script
  entero. Cada bloque nuevo va delimitado (`# --- nombre:begin/end ---`), es independiente de
  los demás y se puede quitar con un solo corte sin tocar el resto.

---

*Actualizar este documento si un método nuevo demuestra valor en un incidente futuro
(parte del DoD de ese incidente). Referenciado desde RUNBOOK §6.*
