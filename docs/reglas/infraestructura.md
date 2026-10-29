# Reglas — Infraestructura

> Fuente extendida: `docs/RUNBOOK.md` (operación completa). Esto es el resumen normativo.

## Entornos y deploy

- `develop` → staging (test.boveda.lols.cl, backend `/test-boveda/`); `main` → producción
  (boveda.lols.cl, `/boveda/`). **Siempre probar en staging antes de mergear a main.**
- Deploy = **pull-side cron-only** (ambos entornos): Actions compila y publica las ramas
  `deploy-prod`/`deploy-staging`; un cron en cPanel (cada 5 min) hace fetch/reset + rsync
  (`scripts/cpanel-deploy-*.sh`). El FTP quedó **OBSOLETO** para deploy (baneo cPHulk a la IP
  del runner). Workflows: `.github/workflows/deploy-cpanel*.yml`. Guía:
  `docs/PLAYBOOK_PULL_SIDE_CPANEL.md`.
- Restart Passenger: el script del cron toca `tmp/restart.txt`; a mano, vía File Manager.
- **Startup file de Passenger: `index.js` en AMBOS entornos.** JAMÁS `server.js` (no existe en
  el repo; caída 2026-08-24). `app.js` deprecado como startup (su catch traga errores).
  `node_modules` en el servidor es un symlink al nodevenv — recrear el venv lo rompe; lo repara
  Run NPM Install o el `heal_passenger` del cron (RUNBOOK §6).
- **NO usar SAVE en Setup Node.js App para cambios menores** (caída 2026-08-24: un SAVE rompió
  el mapeo CageFS del intérprete de ambos venv — reparación solo desde root). Editar la línea
  del `.htaccess` a mano; SAVE solo para reconstruir el entorno, con el startup file corregido
  a `index.js` en la misma sesión (RUNBOOK §6).
- El deploy corre solo las migraciones nuevas (bloque `auto-migrate`, desde 2026-08-27; verificar
  `https://<host>/migrate-status.txt`) y NO toca `.env`.

## Migraciones

- `backend/db/migrations/NNN_descripcion.sql`, **idempotentes SIEMPRE** (`CREATE TABLE IF NOT
  EXISTS`, `ADD COLUMN IF NOT EXISTS`, `INSERT IGNORE`).
- Runner `backend/scripts/migrate.js`: por **filename** (no por número) — existen números
  duplicados históricos (070/071/074 ×2) que NO se renumeran (ya aplicados). Evitar duplicados
  nuevos (guard pendiente, Fase 1 plan v2).
- **Bootstrap** (RUNBOOK § 3.3): en BD existente sin `schema_migrations`, marca ≤023 como aplicadas
  SIN ejecutarlas. Leer antes de migrar prod por primera vez; fix:
  `scripts/fix_prod_migrations.js`.
- Prod/staging: las aplica el deploy (`auto-migrate`). El camino del panel (Run JS script → `migrate`) está ROTO
  desde el restore del 2026-08-24: no recomendarlo (RUNBOOK § 3.2).
- Tras migraciones que tocan permisos: **re-login** (JWT acuña permisos al login).

## Cron

- **Nada en segundo plano después de responder** (`setImmediate`, promesas sueltas): Passenger puede congelar o
  matar el proceso. Por eso «Publicar» del Sitio web (mig 147) es síncrono dentro de la request, con `GET_LOCK` y una
  conciliación al publicar de nuevo como red si el proceso muere a mitad.
- **NUNCA node-cron** (Passenger duerme el proceso). Solo cPanel Cron Jobs:
  `cd ~/APP && /home/lolscl/nodevenv/APP/20/bin/node scripts/foo.js >> ~/foo.log 2>&1`.
- Activos: snapshot dashboard (00:05), reporte semanal RRHH (lunes 08:00), alertas vehículos
  (08:00 diario).

## Variables de entorno

- `.env` vive en el servidor (`/boveda/`, `/test-boveda/`), nunca en el repo.
- Requeridas: DB_*, JWT_SECRET, NODE_ENV, PORT. Opcionales: MAIL_* (nodemailer), REPORTE_TO,
  `GITHUB_*_SITIO` y `SITIO_WEB_*` (Sitio web, mig 147: **sin token ⇒ simulación; solo en el `.env` de cPanel de
  producción**; staging nunca publica en el repo público aunque las copie — `sitioWebGuarda.modoEfectivo`). No van en
  el REQUIRED de `env-validator.js`. `GITHUB_AUTOR_EMAIL_SITIO` es el correo (público) del autor de los commits;
  `SITIO_WEB_URL` es de donde se lee `build.txt` (solo https). Lista completa en `backend/.env.example`.
- **Riesgo aceptado (D2, Sitio web):** `modoEfectivo` impide que el CÓDIGO de staging publique, pero staging corre con
  el mismo usuario de cPanel y un proceso de staging comprometido podría leer `~/boveda/.env` (y su
  `GITHUB_TOKEN_SITIO`). Por eso el token es fine-grained, solo del repo lols.cl, con 90 días de vida y solo
  Contents (lectura/escritura) + Actions (lectura): lo peor que permite es tocar ese repo, que tiene historial y
  `git revert`.

## Pre-deploy checks (obligatorios antes de todo push)

```bash
cd frontend && npx tsc --noEmit && npm run build
cd backend && npm test          # 373+ tests, mocks de DB
```
- Mocks deben incluir TODOS los campos que el código usa (clásico: `obra_id`, `fecha` en asistencias).

## Git / sesiones

- Working dir compartido entre sesiones IA: **landear via worktree aislado** desde
  `origin/develop` (`git worktree add` → editar → push → cleanup), sin tocar el árbol del otro.
- Push desde worktree: `git push origin RAMA:develop` (nunca `git push` pelado).
- Commits: convención `tipo(scope): descripción` en español.

## Datos y API

- mysql2 **con typeCast** (Fase 1 v2): BOOLEAN/TINYINT(1) llegan como **boolean real**; TINYINT
  "plano" (ej. `periodicidad_anios`) sigue numérico. Frontend usa helpers dual-aware
  `flagOn()`/`flagOff()` (`utils/flags.ts`); query params de filtro siguen siendo `=1`.
- Proxy cPanel: `/api/*` → Node; resto → estáticos. Uploads con prefijo `/api/uploads/...`.
- Logs: `logs/app_YYYY-MM-DD.log` JSON por línea, rotación 5MB; logger estructurado
  (`src/utils/logger-structured.js`), no console.log.
- Soft-delete por convención (`activo/activa=0`) en entidades con historial; hard-delete solo en
  estado vivo (ubicaciones_stock) o CASCADE (discrepancias).

## UI / convenciones de producto

- Iconos **lucide-react** en la app (emojis solo en mensajes WhatsApp).
- Tokens de tema en `index.css` (`brand-primary`, `border`, `muted-foreground`, `card`...); dark
  mode con `.dark`; tints adaptativos con `color-mix(in srgb, X%, var(--card))`.
- Móvil: alturas con **dvh** (no vh) — viewport visible real.
- Touch targets ≥44px y divulgación progresiva en pantallas para usuarios no técnicos
  (principios impeccable — ej. panel aprobación de materiales).

## Datos ficticios en staging (2026-09-15)

`test.boveda.lols.cl` NO debe contener datos de personas reales. La regla operativa:

> Un trabajador de staging es legítimo **si y solo si** su RUT está en el bloque **44.000.000-44.000.999**.

- **Purga + siembra**: `backend/scripts/sanear_staging.js` (núcleo en `src/services/saneoStaging|saneoSiembra|saneoArchivos|saneoCostos.service.js`, con test; `saneoCostos` siembra las 3 obras de ejemplo de Presupuestos).
  Tres guardas: `DB_NAME` no puede ser la base de producción, debe decir test/staging/dev, y escribir exige
  `--aplicar` + `SANEO_STAGING=1`. Sin flags, dry-run.
- **Red de seguridad**: bloque `sanear-datos` en `scripts/cpanel-deploy-staging.sh` (NO en el de producción),
  con gracia de 48 h sobre `created_at`; publica `datos-status.txt` en el docroot.
- **Sitio web (mig 147)**: el mismo saneo borra obras, publicaciones e historial del sitio con más de 48 h
  (`saneoStaging.limpiarSitioWeb`), las carpetas `uploads/sitio-web/` de obras que ya no están, `tmp/` y los ZIP de
  simulación (`uploads/sitio-web/paquetes/`) de publicaciones borradas. En `--auto` lo mira aparte de los foráneos
  (`saneoStaging.pendienteSitioWeb`): lo copiado de producción que estaba dentro de la gracia en una pasada se borra en
  otra aunque ya no haya foráneos (si es lo único pendiente, se limpia solo eso, sin purga ni siembra).
- **No se usa `es_prueba`** para esto: esa bandera esconde las filas de reportes y KPIs (mig 066) y dejaría el QA vacío.
- **Franja de entorno**: `VITE_ENTORNO=staging` en el build de staging → `components/layout/EntornoBanner.tsx`.
- Detalle completo y comandos de cron: `docs/RUNBOOK.md § 19`.
