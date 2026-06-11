# Arquitectura Bóveda LOLS v2 — Plan maestro y estado

> Documento vivo. Cada fase completada se marca aquí con fecha y métricas vs baseline.
> Reglas de negocio: `docs/reglas/`. Operación: `docs/RUNBOOK.md`.

## Arquitectura objetivo (formalizar la actual, no reescribir)

**Backend** (Node + Express, JS, MySQL):
```
routes/   → HTTP, auth (checkPermission), validación zod (Fase 1)
services/ → lógica de negocio + SQL parametrizado (única capa que toca DB)
config/   → permisos.config, db (con typeCast desde Fase 1)
```
Prohibido: SQL en rutas; rutas inline en index.js (se extraen en Fase 4); lógica en middleware.

**Frontend** (React + Vite + TS + Tailwind v4):
```
pages/        → layout y orquestación (delgadas)
components/ui → design system (Button, Input, Modal, Chip, StatusBadge…)
components/*  → componentes de dominio
hooks/        → datos (TanStack Query desde Fase 3)
utils/        → format.ts, statusConfig.ts, flags.ts (fuentes únicas)
services/api  → axios (única capa que llama HTTP)
```
Prohibido (enforced por ESLint desde Fase 2): `<button>` crudo, `text-[Npx]` nuevos, fetch fuera de
hooks, helpers de formato locales.

## Decisiones de arquitectura (y por qué)

| Decisión | Elección | Razón |
|---|---|---|
| Capa de datos | **typeCast + validateBody propio + SQL crudo; SIN ORM** | 335 queries ya parametrizadas; SQL complejo (FIFO/SoD) se expresa mal en ORM; cPanel limita tooling. NO zod: el deploy excluye `node_modules` → dep nueva = npm install manual + ventana de crash; el mini-DSL propio (`middleware/validateBody.js`) cubre required/tipos/format/strip sin dep (decidido en F1.3, 2026-06-11) |
| Estado servidor FE | **TanStack Query**, migración gradual por módulo | caché + dedup + fin de los nonce-remount; convive con hooks actuales |
| Tests FE | **Vitest + RTL**, solo flujos críticos + ui/ | red de seguridad para refactor, no cobertura total |
| Hosting/deploy | cPanel + Passenger + lftp (SIN CAMBIO) | restricción fija |
| Backend TS | NO migrar; JSDoc donde aporte | costo/beneficio no paga en JS estable con 373 tests |
| Reglas de negocio | `docs/reglas/` por dominio | mantenibles, referenciadas desde CLAUDE.md |

## Baseline (junio 2026) — medir progreso contra esto

| Métrica | Valor | Meta |
|---|---|---|
| `text-[Npx]` arbitrarios | **555** en 77 archivos | 0 (Fase 2) |
| `<button>` crudos | **76** (vs 48 `<Button>`) | 0 (Fase 2) |
| Definiciones duplicadas fmtMoney / fmtDate | 7 / 4 | 1 / 1 (Fase 2) |
| `hasPermission` inline en JSX | ~252 | mayoría vía `<RequirePermission>` (Fase 3) |
| Tests frontend | **0** | ui/ + 3 flujos críticos (Fase 3) |
| TransferenciaDetail.tsx | 2.430 líneas | <500/archivo (Fase 4) |
| asistencia.service.js / transferencia.service.js | 2.196 / 1.604 | divididos (Fase 4) |
| Rutas inline en index.js | ~227 líneas | 0 (Fase 4) |
| Rutas con validación de body | ~~5%~~ → **escritura oleada 1 ✓ (F1.3, asistencias/transferencias/usuarios/obras)** | 100% escritura (resto en oleadas siguientes) |
| Booleans API | ~~0/1 (sin typeCast)~~ → **boolean real ✓ (F1.1, 2026-06-10)** | boolean real (Fase 1) |
| Tests backend | 396 ✓ | mantener verdes siempre |

## Fases

- [x] **F0 — Documentación y línea base** (2026-06-10): `docs/reglas/` (9), este documento, puntero CLAUDE.md.
- [x] **F1 — Núcleo backend** (completada 2026-06-11):
  - [x] F1.1 typeCast en db.js (2026-06-10): TINYINT(1)→boolean; barrido de comparaciones estrictas
    (1 fix backend: asistencia.service workersToInclude; frontend sabados → flagOn/flagOff
    dual-aware). PENDIENTE QA staging exhaustivo antes de F1.3.
  - [x] F1.2 (2026-06-11): guard anti-duplicados en migrate.js (whitelist 007/032/054/070/071/074 +
    test `migrate_guard.test.js`); request-id por request vía AsyncLocalStorage (`utils/request-context.js`,
    header `X-Request-Id`, reqId auto en todos los logs); barrido de los ~43 `console.*` runtime de
    `src/` al logger estructurado (scripts/ CLI se dejan).
  - [x] F1.3 (2026-06-11): validateBody v2 **sin zod** (mini-DSL propio extendido: strip de keys
    desconocidas + format email/date + minLength). Schemas en `backend/src/schemas/` (asistencias,
    transferencias, usuarios, obras). Aplicado a create/update + payloads anidados de oleada 1; strip
    activo donde es seguro (usuarios PUT — única protección, sin allowedFields; recibir; resolver;
    obras vía factory). 17 tests nuevos. Decisión: NO zod porque el deploy excluye node_modules.
- [ ] **F2 — Design system**: escala tipográfica semántica en `@theme` (~5 tokens) y migración de
  los 555 usos POR PÁGINA; componentes IconButton/Chip/StatusBadge/EmptyState/Section; adopción
  total de Button/Input; `utils/format.ts` + `utils/statusConfig.ts` únicos; reglas ESLint
  anti-regresión; `docs/reglas/diseno.md`.
- [ ] **F3 — Datos FE + patrones**: TanStack Query por módulo (Vehículos primero); patrones
  MasterDetailPage / TabbedPage / CrudSettingsPage; `<RequirePermission>`; Vitest+RTL (ui/ +
  asistencia diaria + aprobación transferencia + gating permisos).
- [ ] **F4 — Monolitos** (requiere F1-F3): FE: TransferenciaDetail → `transferencias/`,
  Consultas, Settings, AttendanceDailyTab, ResumenMensualTable. BE: asistencia.service →
  +excel+alertas; transferencia.service → +sod+stock; rutas inline → `src/routes/`. Regla: mover
  sin cambiar comportamiento, tests antes/después, un monolito por iteración.
- [ ] **F5 — Pasada visual por apartado**: Dashboard → Asistencia → Consultas → Inventario (tab a
  tab) → Vehículos → Obras Finalizadas → Configuración. Incluye QA dark mode por tab y
  accesibilidad (≥44px, focus visible).
- [ ] **F6 — Endurecimiento**: índices (logs_actividad.created_at), collation logs, evaluar
  password-reset, 2-3 tests integración con DB real, medición final vs baseline.

## Working agreement

1. **Una fase activa a la vez**; items chicos: worktree aislado → develop → QA staging → siguiente.
2. Features urgentes conviven (sin freeze); en áreas migradas rigen las reglas nuevas (ESLint).
3. Cada item: `tsc --noEmit` + `npm run build` + `npm test` backend (+ Vitest desde F3).
4. Cada fase cierra actualizando este documento (checkbox + métricas) y `docs/reglas/`.
5. Migraciones siempre idempotentes; las corre el humano (cPanel `migrate`) + re-login si tocan permisos.
6. **Prohibido `git push --force` a `develop`/`main`.** Una sesión paralela force-pusheó develop
   (2026-06) y borró 2 commits (docs F0 + typeCast F1.1); se recuperaron por cherry-pick. Si un push
   es rechazado por non-fast-forward: `git fetch` + rebase + reintento, nunca `--force`. Recomendado:
   branch protection en GitHub con force-push bloqueado.
