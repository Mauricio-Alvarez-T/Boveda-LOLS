# HANDOFF — Reporte Semanal RRHH (Slice A completo, B/C pendientes)

Fecha: 2026-05-29. Commit: `97331e7` en `develop`.

## Estado actual

**Slice A COMPLETO y desplegado en staging (`test.boveda.lols.cl`).**

### Archivos nuevos/modificados (Slice A)
| Archivo | Qué hace |
|---|---|
| `backend/src/services/reporteSemanal.service.js` | Core: date helpers, 7 SQL queries (4 semanales + 3 mensuales tendencias), renderHtml (paleta sobria, KPI cards, gráficos barras HTML puro, gate aniversarios 1er lunes), renderText |
| `backend/src/services/email.service.js` | Agregado `sendSystemEmail()` — usa env MAIL_HOST/PORT/SECURE/USER/PASS (NO credenciales en código) |
| `backend/scripts/reporte_semanal.js` | Script standalone para cron cPanel. Args: `--dry`, `--to email`, `--fecha YYYY-MM-DD`. Abre/cierra su propia conexión DB |
| `backend/scripts/generate_logo_assets.js` | Rasteriza SVG → PNG (sharp). Genera `assets/logo-lols-{green,white}.png` |
| `backend/assets/logo-lols-{green,white}.png` | Logo LOLS rasterizado para CID embed en email |
| `backend/tests/reporteSemanal.test.js` | 20 tests: date math, queries, render, escaping, tendencias zero-fill, gate aniversarios |
| `backend/package.json` | Alias `reporte-semanal` agregado |
| `.gitignore` | Agregado `tmp/` |

### Decisiones de diseño ya tomadas
- **Faltas** = solo código 'A' (Ausente injustificada). NO incluye justificadas.
- **Aniversarios 10 meses** = solo se informan el **1er lunes de cada mes** (flag `aniversariosVigentes`). Otros lunes → KPI "—" + nota.
- **Paleta sobria**: verde `#33715A`, terracota `#A85852`, azul acero `#5B7C99`, header sólido `#1C4D38`. Sin gradientes saturados.
- **Gráficos**: HTML puro (tablas con celdas coloreadas), NO imágenes. Funciona en Gmail/Outlook/móvil.
- **Logo**: SVG de `frontend/src/components/ui/Logo.tsx` rasterizado a PNG con sharp. Verde para chip blanco en header. CID embed via nodemailer.
- **Destinatarios**: `--to` > tabla `reportes_suscriptores` (Slice B, no existe aún) > env `REPORTE_TO`. Fallback graceful si tabla no existe (ER_NO_SUCH_TABLE).
- **Cron**: cPanel cron, NO node-cron (Passenger duerme proceso). Patrón: `0 8 * * 1`.

### Pasos pendientes del usuario (staging)
1. Agregar a `.env` de staging:
   ```
   MAIL_HOST=mail.lols.cl
   MAIL_PORT=465
   MAIL_SECURE=true
   MAIL_USER=reportes@lols.cl
   MAIL_PASS=<password>
   ```
2. Test real: `npm run reporte-semanal -- --to suCorreo@lols.cl`
3. Rotar password de reportes@lols.cl (fue expuesta en chat previo).

## Slice B — CRUD suscriptores (NO iniciado)

### Migración
- Archivo: `backend/db/migrations/066_reportes_suscriptores.sql`
- Tabla `reportes_suscriptores`: id, email VARCHAR(255), nombre, activo TINYINT DEFAULT 1, created_at, updated_at
- Permiso: `INSERT IGNORE INTO permisos (codigo, descripcion, modulo) VALUES ('sistema.reportes.gestionar', 'Gestionar suscriptores de reportes', 'sistema');`
- Idempotente (CREATE TABLE IF NOT EXISTS, INSERT IGNORE).

### Backend
- CRUD REST: `GET/POST/PUT/DELETE /api/reportes/suscriptores`
- Middleware auth + permiso `sistema.reportes.gestionar`
- Router en `backend/src/routes/reportes.routes.js`
- Registrar en `backend/index.js`

### Frontend
- Panel en Configuración → "Reportes Automáticos" (nueva tab o sección en Settings.tsx)
- Tabla editable: email, nombre, toggle activo, botón eliminar
- Formulario agregar suscriptor
- Botón "Enviar reporte de prueba" (llama endpoint con `--dry` o `--to`)

## Slice C — Cron + producción (NO iniciado)

### Staging
- cPanel → Cron Jobs → `0 8 * * 1` →
  ```
  cd ~/test-boveda && /home/lolscl/nodevenv/test-boveda/20/bin/node scripts/reporte_semanal.js >> ~/reporte-test.log 2>&1
  ```

### Producción
- Merge develop → main (tras validación completa en staging)
- cPanel prod → Cron Jobs → `0 8 * * 1` →
  ```
  cd ~/boveda && /home/lolscl/nodevenv/boveda/20/bin/node scripts/reporte_semanal.js >> ~/reporte.log 2>&1
  ```
- Agregar MAIL_* vars al `.env` de prod

### RUNBOOK
- Actualizar `docs/RUNBOOK.md` §4.1 con entrada del reporte semanal (patrón cron, logs, troubleshooting)
- Agregar §5 "Automatizaciones" si no existe

## Dark mode — tabs pendientes

| Tab | Componente(s) | Estado |
|---|---|---|
| Facturas | `FacturasTab.tsx` | ⬜ pendiente |
| Movimientos | `MovimientosTab`, `MovimientoForm`, `NewMovimientoModal`, `SolicitudForm`, `FaltanteDecisionModal` | ⬜ pendiente |

### Patrón dark mode (referencia rápida)
- Tailwind v4: `@custom-variant dark (&:where(.dark, .dark *))` en index.css
- Badges: `bg-{c}-100 text-{c}-700 border-{c}-200` → agregar `dark:bg-{c}-500/15 dark:text-{c}-300 dark:border-{c}-800/60`
- Gray: → `dark:bg-muted dark:text-muted-foreground dark:border-border`
- **INTOCABLE**: solid `bg-{c}-500 text-white`, gradientes text-white, glass overlays `bg-white/≤20`, corporate green `#027A3B`/`#1EBE5B`, iOS purple, WhatsApp green
- Pre-push: `cd frontend && npx tsc --noEmit && npm run build`

## Reglas críticas (recordatorio)
- **Nunca** almacenar passwords en código/commits. Solo en `.env` del servidor.
- **Nunca** cambiar lftp deploy a FTP-Deploy-Action.
- **Nunca** usar node-cron (Passenger duerme proceso).
- Pre-push: `cd frontend && npx tsc --noEmit` + `cd backend && npm test`
- Migraciones idempotentes siempre.
- Archivos `Validacion_Sistema_*.xlsx` son untracked A PROPÓSITO.
- TAREA EN PAUSA: Validación RRHH Fase A — NO reanudar sin confirmación explícita del usuario.
