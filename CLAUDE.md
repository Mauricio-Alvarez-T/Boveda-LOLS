# CLAUDE.md — Instrucciones para IAs trabajando en Bóveda LOLS

## ⚠️ Leer antes de cualquier acción de infra

**Si vas a tocar base de datos, migraciones, workflows de deploy, o scripts de servidor:**
→ Lee primero `docs/RUNBOOK.md`. Contiene contexto crítico que evita errores graves en producción.

## 📐 Reglas de negocio y arquitectura

- **`docs/reglas/`** — TODAS las reglas de negocio por categoría (asistencia, inventario, obras,
  RRHH, seguridad, vehículos, bombas, infraestructura). **Léelas antes de modificar lógica de un
  dominio**; si cambias una regla en el código, actualiza su archivo (parte del Definition of Done).
- **`docs/ARQUITECTURA.md`** — arquitectura objetivo, plan v2 por fases, decisiones (no-ORM,
  TanStack Query, design system) y métricas baseline. Las features nuevas siguen estas convenciones.

---

## Resumen del Proyecto

**Bóveda LOLS** es un sistema de gestión documental y operacional para obras de construcción.

- **Frontend:** React + Vite → directorio `frontend/`
- **Backend:** Node.js + Express → directorio `backend/`
- **DB:** MySQL (usuario `lolscl_boveda`, DB `lolscl_boveda`)
- **Servidor:** cPanel + Phusion Passenger (hosting compartido, sin Docker, sin SSH directo en la mayoría de operaciones)

---

## Entornos

| Entorno | Branch | URL | Backend path |
|---|---|---|---|
| Producción | `main` | `boveda.lols.cl` | `/boveda/` |
| Staging | `develop` | `test.boveda.lols.cl` | `/test-boveda/` |

El deploy es automático vía GitHub Actions al hacer push a `main` o `develop`.

---

## Reglas Críticas

### Base de Datos
1. **Nunca** modificar tablas directamente en producción sin una migración.
2. Las migraciones van en `backend/db/migrations/NNN_descripcion.sql` (numeradas secuencialmente).
3. Toda migración debe ser **idempotente**: `CREATE TABLE IF NOT EXISTS`, `INSERT IGNORE`, `ADD COLUMN IF NOT EXISTS`.
4. El runner de migraciones tiene un **bootstrap** que puede marcar migraciones como aplicadas sin ejecutarlas. Ver `docs/RUNBOOK.md § 3.3` antes de correr `migrate` en producción por primera vez.
5. Para correr migraciones en producción: cPanel → Setup Node.js App → Run JS script → `migrate`.

### Deploy
1. Siempre probar en staging (`develop`) antes de mergear a `main`.
2. **Staging (`develop`) = PULL-SIDE cron-only ✅ LIVE (verificado 2026-06-13).** El workflow compila y
   publica `frontend/dist` + `backend/` en la rama **`deploy-staging`**; un **cron en cPanel** (cada 5
   min) hace `git pull` saliente y auto-despliega. **Este hosting NO tiene Terminal ni Git VC** → el
   setup es 100% por Cron Jobs + File Manager. **Guía: `docs/PLAYBOOK_PULL_SIDE_CPANEL.md`.** Repo
   PÚBLICO → clon sin token. **⚠️ La carpeta `api/` del docroot de staging es el mount de Passenger del
   backend — el deploy la excluye del `rsync --delete`; NUNCA borrarla** (si se borra → login 404 →
   restaurar con playbook §7bis). El cron usa la variante **self-healing** (pre-carga el `.sh` antes de
   correr) para evitar la carrera de auto-modificación del script.
3. **Prod (`main`) = PULL-SIDE cron-only (2026-06-16)**, igual que staging (el ban cPHulk también
   tumba el FTP de prod). El workflow publica `frontend/dist` + `backend/` en la rama **`deploy-prod`**;
   un **cron en cPanel** (cada 5 min) hace `git pull` y despliega a docroot `~/public_html/boveda.lols.cl`
   + backend `~/boveda`. Script: `scripts/cpanel-deploy-prod.sh`. **Setup cPanel: guía en
   `docs/PLAYBOOK_PULL_SIDE_CPANEL.md` §7.** Mismas reglas que staging: NUNCA borrar la carpeta `api/`
   del docroot (mount de Passenger; excluida del `rsync --delete`); cron self-healing.
4. Verificar runs desde la CLI: `gh run list --workflow deploy-cpanel-staging.yml` (gh ya autenticado).

### Tests
- Correr antes de cualquier PR: `cd backend && npm test`
- Los tests usan mocks de DB (no conexión real). Los mocks deben incluir todos los campos que el código usa (especialmente `obra_id` y `fecha` en mocks de `asistencias`).

---

## Comandos Frecuentes

```bash
# Desarrollo local
cd backend && npm run dev        # Backend con nodemon
cd frontend && npm run dev       # Frontend con Vite

# Tests
cd backend && npm test

# Migraciones local
cd backend && npm run migrate

# Build frontend
cd frontend && npm run build
```

---

## Archivos Clave de Infra

| Archivo | Propósito |
|---|---|
| `docs/RUNBOOK.md` | Guía completa de operaciones |
| `backend/scripts/migrate.js` | Runner de migraciones |
| `backend/scripts/fix_prod_migrations.js` | Fix para bootstrap incorrecto |
| `backend/package.json` | Scripts npm (incluye aliases para cPanel) |
| `.github/workflows/deploy-cpanel.yml` | Deploy a producción |
| `.github/workflows/deploy-cpanel-staging.yml` | Deploy a staging |

---

## Workflow con Worktrees

Las sesiones de Claude Code usan worktrees en `.claude/worktrees/BRANCH/`. Estos tienen ramas locales que trackean `origin/develop` directamente:

```bash
# Dentro del worktree, el comando correcto es:
git push origin claude/BRANCH:develop

# NO usar "git push" simple — causará "rejected: non-fast-forward"
```

Esto evita la confusión de crear PRs vacíos.

---

## Pre-Deploy Checks

Antes de todo push a `develop` o `main`:

```bash
cd frontend && npx tsc --noEmit    # Type check (evita runtime errors en staging)
cd backend && npm test             # Tests siempre pasan
```

---

## Documentar Aprendizajes

**Cuando resuelvas un problema no trivial** (infra, deploy, DB, UI pattern):
1. Propón una entrada nueva para `docs/RUNBOOK.md § 6 — Errores Comunes` O una sección nueva si corresponde.
2. Si prefieres capturarlo después, usa `/runbook-add`.

No esperes a que el usuario lo pida. Los patrones que funcionan fortalecen el documento para futuras sesiones.
