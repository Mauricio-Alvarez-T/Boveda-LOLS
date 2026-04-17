# CLAUDE.md — Instrucciones para IAs trabajando en Bóveda LOLS

## ⚠️ Leer antes de cualquier acción de infra

**Si vas a tocar base de datos, migraciones, workflows de deploy, o scripts de servidor:**
→ Lee primero `docs/RUNBOOK.md`. Contiene contexto crítico que evita errores graves en producción.

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
2. El deploy usa `lftp mirror --only-newer`. **No cambiar** a FTP-Deploy-Action (genera timeouts en el servidor por carpetas grandes).
3. El restart de Passenger se hace escribiendo `tmp/restart.txt` vía curl FTP — ya está automatizado en el workflow.

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
