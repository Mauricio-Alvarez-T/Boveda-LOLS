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
| Canal WhatsApp | **Meta WhatsApp Business Cloud API (oficial), REST directo con `fetch` nativo; SIN SDK, SIN librerías no oficiales** | cPanel mata daemons y no permite Chromium → whatsapp-web.js/Baileys inviables y violan TOS (ban del número). Cloud API es HTTPS puro, encaja en el patrón cron-standalone existente (F7, decidido 2026-09-08) |

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
- [x] **F2 — Design system** ✅ **CERRADA 2026-06-15**: escala tipográfica semántica en `@theme`
  y migración de los usos POR PÁGINA; componentes IconButton/Chip/StatusBadge/EmptyState/Section;
  adopción total de Button/Input; `utils/format.ts` + `utils/statusConfig.ts` únicos; reglas ESLint
  anti-regresión; `docs/reglas/diseno.md`. **Cierre**: barrido final de las 222 violaciones
  restantes (Inventario completo + stragglers en workers/layout/dashboard/vehiculos/primitivos `ui/`)
  → **0 `<button>` crudo + 0 `text-[Npx]`** (62→Button, 46→IconButton, ~85 `<button>` conservados
  con `eslint-disable` justificado, 26 `text-[Npx]`→token); reglas `no-restricted-syntax` y
  `ds/no-arbitrary-text-size` **flipeadas a `error`**. Gate: `tsc` 0 + `vite build` ok + eslint 0-DS.
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
- [ ] **F7 — Notificaciones WhatsApp** (feature transversal; **corre en paralelo a F3-F6**, no
  depende de ellas). Detalle abajo.

## F7 — Notificaciones WhatsApp (plan, 2026-09-08)

### Objetivo
Que Bóveda envíe mensajes WhatsApp de forma automática (avisos operativos a trabajadores y jefes de
obra) reutilizando la infraestructura de alertas que ya existe por email (`alertas_vehiculos.js`,
`avisos_diarios.js`, `reporte_semanal.js`). WhatsApp es un **segundo canal**, no reemplaza el email.

### Proveedor y restricciones
- **Meta WhatsApp Business Cloud API** (ver tabla de decisiones). Endpoint:
  `POST https://graph.facebook.com/v21.0/{WSP_PHONE_ID}/messages`, header `Authorization: Bearer`.
- Solo el sistema puede **iniciar** conversación con **plantillas aprobadas** por Meta (categoría
  *Utility*). Texto libre solo dentro de las 24 h posteriores a un mensaje del destinatario.
- Número dedicado (no puede estar registrado en la app WhatsApp normal). Token permanente de
  **usuario de sistema** en Business Manager (el token de prueba dura 24 h; prohibido en prod).
- Tier inicial 250 destinatarios únicos/día; sube automático con volumen y calidad. Suficiente
  para LOLS (≈300 trabajadores, ≤1 aviso/semana c/u).
- **Opt-in obligatorio** (política Meta + Ley 21.719): el trabajador debe aceptar recibir mensajes.
  Se guarda evidencia en BD (`trabajadores.wsp_opt_in`, `wsp_opt_in_at`, `wsp_opt_in_origen`).
- Costo estimado: Utility ≈ USD 0.03-0.05/msg Chile → ~1.200 msg/mes ≈ USD 40-60/mes. Sin fee fijo.
- Versión API pineada en env (`WSP_API_VERSION=v21.0`); Meta la depreca a ~2 años → revisar anual.

### Encaje en la arquitectura (mismas reglas que el resto)
```
services/whatsapp.service.js       → sendTemplate({to, template, vars, lang}), normalizarTelefono(),
                                     registrarEnvio(); único punto que habla con Meta. SQL parametrizado.
services/notificaciones.service.js → decide QUÉ avisar (vencimientos, dup cross-obra, resumen jefe obra);
                                     canal-agnóstico: llama email.service y/o whatsapp.service.
routes/whatsapp.routes.js          → GET /webhook (verificación Meta) + POST /webhook (estados/respuestas);
                                     POST /api/wsp/prueba (permiso config.wsp_test) para "enviar prueba".
scripts/notificaciones_wsp.js      → standalone para cron cPanel (patrón avisos_diarios.js: --dry, --to,
                                     --fecha; abre/cierra su pool; exit 1 en error). SIN node-cron (RUNBOOK §4.1).
schemas/whatsapp.schema.js         → validateBody propio para /prueba (NO zod).
```
- Sin dependencias nuevas: `fetch` nativo (Node 20), `crypto` para validar firma `X-Hub-Signature-256`
  del webhook. Motivo: el deploy excluye `node_modules` (ver decisión validateBody).
- Env nuevas (cPanel → Node App → Environment; NUNCA en repo): `WSP_TOKEN`, `WSP_PHONE_ID`,
  `WSP_WABA_ID`, `WSP_VERIFY_TOKEN`, `WSP_APP_SECRET`, `WSP_API_VERSION`, `WSP_ENABLED` (kill switch,
  `false` en staging por defecto → staging solo hace `--dry`).
- Teléfonos: columna `telefono VARCHAR(20)` ya existe en trabajadores y usuarios. Meta exige E.164 sin
  `+` (`569XXXXXXXX`). `normalizarTelefono()` acepta `+56 9 1234 5678`, `912345678`, `9-1234-5678`;
  rechaza lo que no dé 11 dígitos con prefijo 569 (fijos 562 se aceptan pero no reciben WSP → excluir).

### Modelo de datos (migración `103_whatsapp.sql`, idempotente)
```sql
ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS wsp_opt_in TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS wsp_opt_in_at DATETIME NULL;
ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS wsp_opt_in_origen VARCHAR(40) NULL; -- 'ficha','contrato','respuesta'

CREATE TABLE IF NOT EXISTS mensajes_wsp (
  id INT AUTO_INCREMENT PRIMARY KEY,
  destinatario_tipo ENUM('trabajador','usuario') NOT NULL,
  destinatario_id INT NOT NULL,
  telefono VARCHAR(20) NOT NULL,             -- E.164 sin '+'
  plantilla VARCHAR(80) NOT NULL,
  variables JSON NULL,
  evento VARCHAR(60) NOT NULL,               -- 'doc_vencimiento','dup_cross_obra','resumen_jefe_obra',...
  evento_ref VARCHAR(120) NULL,              -- clave idempotencia (ej. 'doc:1234:2026-09-30')
  wamid VARCHAR(120) NULL,                   -- id Meta
  estado ENUM('encolado','enviado','entregado','leido','fallido','rechazado') NOT NULL DEFAULT 'encolado',
  error_codigo VARCHAR(20) NULL,
  error_detalle TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  UNIQUE KEY uq_evento_ref (evento_ref),     -- evita doble envío si el cron corre dos veces
  KEY idx_wamid (wamid),
  KEY idx_dest (destinatario_tipo, destinatario_id, created_at)
);

CREATE TABLE IF NOT EXISTS wsp_respuestas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  telefono VARCHAR(20) NOT NULL,
  wamid VARCHAR(120) NULL,
  texto TEXT NULL,
  contexto_wamid VARCHAR(120) NULL,          -- a qué mensaje nuestro responde
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tel (telefono, created_at)
);
```
Permisos nuevos en `permisos.config.js` (módulo `config`): `wsp_ver` (historial), `wsp_test`
(enviar prueba), `wsp_config` (activar eventos). Re-login tras migrar (regla 5 del working agreement).

### Eventos v1 (qué se manda y a quién)
| Evento | Destinatario | Plantilla (Utility) | Disparo |
|---|---|---|---|
| Documento por vencer (7 y 1 día) | trabajador con opt-in | `doc_vencimiento`: «Hola {{1}}, tu {{2}} vence el {{3}}. Coordina renovación con RRHH LOLS.» | cron diario 08:00 |
| Resumen diario de vencidos/faltantes por obra | jefe de obra (usuario) | `resumen_obra`: «{{1}}: {{2}} trabajadores con documentos vencidos y {{3}} sin asistencia registrada hoy. Detalle: {{4}}» | cron diario 17:30 |
| Duplicado cross-obra detectado (FILA VIGENTE) | jefe de obra + RRHH | `dup_cross_obra` | cron diario, junto al resumen |
| Alertas vehículos (ya existen por email) | responsable flota | `vehiculo_alerta` | reutiliza `alertas_vehiculos.js` → añade canal WSP |
Fuera de v1: OTP/login, mensajes libres desde la UI, marketing. Se evalúan en F7.3.

### Sub-fases
- [ ] **F7.0 — Prueba de concepto (½ día, sin código en repo)**: crear app en developers.facebook.com,
  número de prueba gratuito de Meta, enviar `hello_world` por curl al celular del dueño. Valida acceso
  a Business Manager. **Gate**: mensaje recibido. Entregable humano: Business Manager de LOLS creado,
  número dedicado definido (SIM o fijo), tarjeta cargada.
- [ ] **F7.1 — Núcleo backend**: `whatsapp.service.js` (sendTemplate + normalizarTelefono +
  registrarEnvio), migración 103, permisos, endpoint `/api/wsp/prueba`, kill switch `WSP_ENABLED`.
  Tests con `fetch` mockeado (éxito, 4xx de Meta, teléfono inválido, idempotencia por `evento_ref`).
  **Gate**: `npm test` verde + prueba real desde staging con `WSP_ENABLED=true` puntual al dueño.
- [ ] **F7.2 — Webhook**: `GET/POST /webhook` con verificación `hub.verify_token` y firma HMAC
  `X-Hub-Signature-256` (rechazar sin firma válida). Actualiza `mensajes_wsp.estado`; guarda
  `wsp_respuestas`. Responder 200 siempre en <5 s (Meta reintenta si no). Registrar URL en la app Meta
  (prod: `https://boveda.lols.cl/api/wsp/webhook`). **Gate**: estados `entregado`/`leido` llegan a BD.
- [ ] **F7.3 — Eventos y cron**: `notificaciones.service.js` + `scripts/notificaciones_wsp.js`;
  plantillas creadas y aprobadas en Meta (pedir aprobación al inicio de F7.1: demora horas-días);
  cron cPanel `0 8 * * *` y `30 17 * * *` (mismo patrón que avisos diarios); throttle 10 msg/s con
  reintento exponencial en 429/5xx (máx 3). Extender `alertas_vehiculos.js` al canal WSP.
  **Gate**: 1 semana en prod con `--dry` comparado contra email; luego activar.
- [ ] **F7.4 — UI**: en ficha trabajador: toggle opt-in + fecha/origen + teléfono validado (feedback
  inline si no es móvil chileno); en Configuración: pestaña "WhatsApp" (estado credenciales sin
  mostrar token, botón "enviar prueba", tabla historial `mensajes_wsp` con filtros, activar/desactivar
  eventos). Sigue `docs/reglas/diseno.md` (Button/Chip/StatusBadge; estado del mensaje vía statusConfig).
- [ ] **F7.5 — Cierre**: `docs/reglas/notificaciones.md` (eventos, plantillas, opt-in, límites),
  RUNBOOK §4 (cron nuevo, rotación de token, qué hacer si Meta pausa una plantilla), CLAUDE.md puntero,
  métricas: msgs/mes, % entregados, % fallidos, costo real vs estimado.

### Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|
| Meta suspende cuenta/plantilla (calidad baja, reportes) | solo Utility, solo opt-in, textos cortos y esperados; email sigue como canal principal; `WSP_ENABLED=false` apaga todo sin deploy |
| Doble envío si cron se ejecuta dos veces o falla a medias | `UNIQUE(evento_ref)` + estado `encolado→enviado` transaccional |
| Token filtrado | solo en env cPanel; nunca en logs (logger enmascara `WSP_TOKEN`); rotación semestral documentada en RUNBOOK |
| Teléfonos sucios en BD | `normalizarTelefono()` estricta + reporte `--dry` lista los inválidos antes de activar |
| Datos personales a terceros (Meta) | mínimo necesario en variables (nombre, tipo doc, fecha); nunca RUT ni montos; cláusula en política de privacidad |
| Deprecación de versión API | `WSP_API_VERSION` en env; revisión anual anotada en RUNBOOK |

### Lo que debe entregar el humano antes de F7.1
1. Acceso a **Meta Business Manager** de LOLS (o crearlo) con rol admin para quien configure.
2. **Número dedicado** para WhatsApp Business (no usado en la app WhatsApp de ningún celular).
3. **Método de pago** cargado en Business Manager.
4. Texto de **opt-in** aprobado por RRHH (checkbox en ficha o cláusula de contrato).
5. Lista definitiva de eventos v1 (la tabla de arriba es propuesta).

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
