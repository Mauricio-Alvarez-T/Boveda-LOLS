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
> escribe la sesión de Marcos (pendiente).

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

## Parte 2 — Metodologías (sesión Marcos) — ⏳ PENDIENTE

> Esta sección la completa la sesión de Marcos. Sugerencia de contenido (métodos, no
> conclusiones): el diagnóstico publicado por HTTP (`_diag-incidente.txt` en el
> docroot: qué campos expone y por qué), el diseño de `heal_passenger` (reparación
> guiada por verificación: solo corrige lo verificablemente roto, guardia anti-carrera
> con el panel), la evolución npmfix → `heal-deps` **probe-driven** (probar que los
> deps CARGAN en vez de asumir topología), y la verificación adversarial usada en la
> goma de borrar (revisores independientes con evidencia).

<!-- MARCOS: escribe aquí -->

---

*Actualizar este documento si un método nuevo demuestra valor en un incidente futuro
(parte del DoD de ese incidente). Referenciado desde RUNBOOK §6.*
