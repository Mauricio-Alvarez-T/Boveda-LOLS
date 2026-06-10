# Reglas — Infraestructura

> Fuente extendida: `docs/RUNBOOK.md` (operación completa). Esto es el resumen normativo.

## Entornos y deploy

- `develop` → staging (test.boveda.lols.cl, backend `/test-boveda/`); `main` → producción
  (boveda.lols.cl, `/boveda/`). **Siempre probar en staging antes de mergear a main.**
- Deploy = GitHub Actions con **`lftp mirror -R --only-newer`**. PROHIBIDO cambiar a
  FTP-Deploy-Action (timeouts). Workflows: `.github/workflows/deploy-cpanel*.yml`.
- Restart Passenger: escribir `tmp/restart.txt` vía curl FTP (automatizado en el workflow).
- El deploy NO corre migraciones ni toca `.env`.

## Migraciones

- `backend/db/migrations/NNN_descripcion.sql`, **idempotentes SIEMPRE** (`CREATE TABLE IF NOT
  EXISTS`, `ADD COLUMN IF NOT EXISTS`, `INSERT IGNORE`).
- Runner `backend/scripts/migrate.js`: por **filename** (no por número) — existen números
  duplicados históricos (070/071/074 ×2) que NO se renumeran (ya aplicados). Evitar duplicados
  nuevos (guard pendiente, Fase 1 plan v2).
- **Bootstrap** (RUNBOOK § 3.3): en BD existente sin `schema_migrations`, marca ≤023 como aplicadas
  SIN ejecutarlas. Leer antes de migrar prod por primera vez; fix:
  `scripts/fix_prod_migrations.js`.
- Correr en prod/staging: cPanel → Setup Node.js App → Run JS script → `migrate`.
- Tras migraciones que tocan permisos: **re-login** (JWT acuña permisos al login).

## Cron

- **NUNCA node-cron** (Passenger duerme el proceso). Solo cPanel Cron Jobs:
  `cd ~/APP && /home/lolscl/nodevenv/APP/20/bin/node scripts/foo.js >> ~/foo.log 2>&1`.
- Activos: snapshot dashboard (00:05), reporte semanal RRHH (lunes 08:00), alertas vehículos
  (08:00 diario).

## Variables de entorno

- `.env` vive en el servidor (`/boveda/`, `/test-boveda/`), nunca en el repo.
- Requeridas: DB_*, JWT_SECRET, NODE_ENV, PORT. Opcionales: MAIL_* (nodemailer), REPORTE_TO.

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
