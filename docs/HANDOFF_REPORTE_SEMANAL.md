# HANDOFF — Reporte Semanal RRHH (Slice A + C en PRODUCCIÓN, B pendiente)

Fecha: 2026-05-29. Release a producción: merge `0410ff4` en `main` (deploy verde).
Doc/runbook al día en `develop` (`aa03df3`).

## Estado actual

**Slice A + C EN PRODUCCIÓN y staging. Slice B (CRUD suscriptores) sin iniciar.**

| Slice | Staging (`test-boveda` / develop) | Producción (`boveda` / main) |
|---|---|---|
| **A — Reporte (script/servicio/email)** | ✅ Desplegado y validado (envío real OK) | ✅ Desplegado (`0410ff4`, CI verde) |
| **B — CRUD suscriptores** | 🔲 No iniciado | 🔲 No iniciado |
| **C — Cron + migración + env** | ✅ `migrate` 066 ✅ · `.env` MAIL_* ✅ · cron `0 8 * * 1` ✅ validado con cron temporal | ⏳ `migrate` 066 ✅ corrido · **falta**: `.env` MAIL_*+REPORTE_TO, prueba `reporte-semanal`, cron `0 8 * * 1` (pasos manuales del usuario en cPanel) |

> **Dato de infra (prod):** el `.env` de producción tiene solo ~5 vars (credenciales DB); el resto de la config de la app viene del panel "Environment variables" de Passenger. **El cron corre fuera de Passenger**, así que `MAIL_*` y `REPORTE_TO` deben ir SÍ o SÍ en `/home/lolscl/boveda/.env` (no basta el panel). Documentado en RUNBOOK § 4.1.

### Archivos nuevos/modificados (Slice A)
| Archivo | Qué hace |

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

### Staging — COMPLETADO ✅
`.env` final en `/home/lolscl/test-boveda/.env` (`MAIL_HOST=localhost`, `MAIL_PORT=465`,
`MAIL_SECURE=true`, `MAIL_USER=reportes@lols.cl`, `MAIL_PASS=***`, `REPORTE_TO=mauricioalvarez@lols.cl`).
Migración 066 aplicada. Cron `0 8 * * 1` puesto y validado (cron temporal "+2 min" → log con `messageId` nuevo → borrado).

### Producción — pasos pendientes del usuario (en cPanel, app `boveda`)
1. ✅ `migrate` (066 aplicada — hecho).
2. ⏳ Agregar a `/home/lolscl/boveda/.env` (el archivo, no el panel Passenger — ver nota de infra arriba):
   ```
   MAIL_HOST=localhost
   MAIL_PORT=465
   MAIL_SECURE=true
   MAIL_USER=reportes@lols.cl
   MAIL_PASS=<password>
   REPORTE_TO=<lista real de destinatarios, CSV>
   ```
3. ⏳ Test real: Run JS script `reporte-semanal` (o Terminal `--to suCorreo@lols.cl`).
4. ⏳ Cron `0 8 * * 1`: `cd ~/boveda && /home/lolscl/nodevenv/boveda/20/bin/node scripts/reporte_semanal.js >> ~/reporte.log 2>&1`.
5. 🔐 Rotar password de `reportes@lols.cl` (expuesta en chat) y actualizar `MAIL_PASS` en AMBOS `.env`.

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

## Slice C — Cron + producción

### Staging ✅ COMPLETADO
- Cron `0 8 * * 1` puesto y validado:
  ```
  cd ~/test-boveda && /home/lolscl/nodevenv/test-boveda/20/bin/node scripts/reporte_semanal.js >> ~/reporte-test.log 2>&1
  ```

### Producción — merge ✅ / cPanel ⏳
- ✅ Merge `develop → main` (`0410ff4`), deploy verde, `migrate` 066 aplicada en prod.
- ⏳ Falta (pasos manuales del usuario, ver "Producción — pasos pendientes" arriba): `.env` MAIL_*+REPORTE_TO, prueba `reporte-semanal`, cron:
  ```
  cd ~/boveda && /home/lolscl/nodevenv/boveda/20/bin/node scripts/reporte_semanal.js >> ~/reporte.log 2>&1
  ```

### RUNBOOK ✅ COMPLETADO
- `docs/RUNBOOK.md` § 4.1 → caso "Reporte Semanal RRHH" (cron, flags `--dry`/`--to`/`--fecha`, vars, prueba con cron temporal).
- `docs/RUNBOOK.md` § 6 → fila "deploy de código acoplado a migración" (`Unknown column` post-deploy → orden deploy→migrate→verificar).

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
