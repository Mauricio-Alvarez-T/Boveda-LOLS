# Roadmap — Refactor "Historial de Actividad"

> **Estado actual:** ✅ COMPLETADO. Sprints 1-4 ejecutados y desplegados a staging.
> **Rama de trabajo:** `develop`
> **Plan original:** `C:\Users\maatr\.claude\plans\regalon-necesito-contruir-una-sorted-diffie.md`

---

## 📊 Contexto

El usuario reportó que el Historial de Actividad (`Configuración → Sistema & Correo → Historial`) "casi no se usa porque es tedioso y mal estructurado".

Audit profundo identificó 5 patologías principales:

| # | Patología | Razón en el código | Estado |
|---|-----------|-------------------|--------|
| 1 | **Spam de logins ahoga la señal** | Cada login = 1 fila ("Inicio de sesión exitoso: x@y"). Pasar 4 páginas para ver un UPDATE. | ✅ Fix: ocultos por default + toggle |
| 2 | **Sin filtros contextuales** | Buscador único hacía `LIKE` sobre `modulo|detalle`. | ✅ Fix: filtros usuario, módulo, acción, entidad, fechas |
| 3 | **Detalles ocultos tras modal** | Diff sólo aparecía al click "Ver detalles". | ✅ Fix: resumen inline + modal sólo en diff complejo |
| 4 | **IP + UA = ruido visual** | `127.0.0.1` y `Mozilla/5.0` truncado eran inútiles para no-técnicos. | ✅ Fix: ocultos en fila, accesibles por tooltip/modal |
| 5 | **Sin contexto de entidad** | "Editó trabajador ID 42" → nadie recuerda quién es 42. | ✅ Fix: columnas `entidad_tipo` + `entidad_label` |

**Performance:** índices compuestos `(modulo, created_at)`, `(usuario_id, created_at)`, `accion` y `(entidad_tipo, entidad_label)` agregados en migración 041.

---

## ✅ Decisiones del usuario (Phase 3)

| Decisión | Elección | Implicación | Estado |
|----------|----------|-------------|--------|
| **Logins** | Ocultos por default + toggle "Ver accesos" | Filtro por defecto excluye `accion='LOGIN'`. Checkbox los suma. | ✅ |
| **Entidad** | Columnas `entidad_tipo` + `entidad_label` | Migración 041 + middleware con `resolveEntidad`. | ✅ |
| **Retención** | Sin política | Logs permanentes. Reevaluar al pasar 1M filas. | ✅ (decisión registrada) |
| **Extras** | Sólo Export CSV con filtros | Severidad tipada, drill-down y anonimización IP fuera de alcance. | ✅ |

---

## 🟢 Sprint 1 — Backend schema + middleware enriquecido — COMPLETADO

**Commit:** `9915056` (push `develop` 2026-04-30).

### 1.1 Migración 041 — `historial_entidad_y_indices.sql` ✅

**Archivo:** `backend/db/migrations/041_historial_entidad_y_indices.sql`

Patrón idempotente `information_schema + PREPARE/EXECUTE`. Aplicada en staging vía `cPanel → Run JS script → migrate`. Validada con `DESCRIBE logs_actividad`.

Columnas añadidas:
- `entidad_tipo VARCHAR(40) NULL AFTER item_id`
- `entidad_label VARCHAR(160) NULL AFTER entidad_tipo`

Índices añadidos:
- `idx_logs_modulo_created (modulo, created_at)`
- `idx_logs_usuario_created (usuario_id, created_at)`
- `idx_logs_accion (accion)`
- `idx_logs_entidad (entidad_tipo, entidad_label)`

### 1.2 `resolveEntidad()` + INSERT enriquecido ✅

**Archivos:**
- `backend/src/config/log-config.js` (NUEVO) — `EXCLUDED_KEYS`, `LABEL_MAP`, `ENTIDAD_RESOLVERS`, `NOISY_ACCIONES`, `ACCIONES_VISIBLES`.
- `backend/src/middleware/logger.js` (REFACTOR) — helper `resolveEntidad(modulo, item_id, body)`.

`ENTIDAD_RESOLVERS` cubre 11 módulos: trabajadores, obras, empresas, cargos, usuarios, tipos-ausencia, estados-asistencia, transferencias, items-inventario, bodegas, sabados-extra.

`logManualActivity()` extiende firma con extras opcionales (default `{}`) para no romper callers existentes.

### 1.3 Tests Sprint 1 ✅

**Archivos:**
- `backend/tests/logger_entidad.test.js` (NUEVO) — 13 casos.
- `backend/tests/asistencia_logs.test.js` (UPDATE) — params shift `[4]→[6]` por columnas nuevas.

**Resultado:** 218 / 218 tests pasando tras Sprint 1 (eran 205 antes).

---

## 🟢 Sprint 2 — Backend filtros + export CSV — COMPLETADO

**Commit:** `691abf6` (push `develop` 2026-04-30).

### 2.1 `GET /api/logs` con filtros ✅

**Archivo:** `backend/src/routes/logs.routes.js`

Filtros: `q`, `usuario_id`, `modulo`, `accion` (CSV), `entidad_tipo`, `desde`, `hasta`, `incluir_logins`, `page`, `limit` (max 200).

Response: `{ data, total, page, limit, total_pages }`.

Helper `buildLogsFilter()` compartido con `/export` para garantizar que el CSV refleja exactamente lo que muestra la pantalla.

### 2.2 `GET /api/logs/filtros` ✅

Devuelve `usuarios`, `modulos`, `entidad_tipos`, `acciones` (DISTINCT efectivamente presentes) + `acciones_default`.

### 2.3 `GET /api/logs/export` (CSV) ✅

Stream row-por-row con BOM UTF-8 (Excel ES). Tope hard 50.000 filas. Header: Fecha · Usuario · Módulo · Acción · Tipo entidad · Entidad · Resumen · IP · Item ID. Helper `csvCell()` escapa comillas/comas/`;`. Connection dedicada con `release()` en `finally`.

### 2.4 Tests Sprint 2 ✅

**Archivo:** `backend/tests/logs_filtros.test.js` (NUEVO) — 17 casos cubriendo filtros, paginación, /filtros y /export.

**Resultado:** 235 / 235 tests pasando tras Sprint 2.

---

## 🟢 Sprint 3 — Frontend UX — COMPLETADO

**Commit:** `5c6ab15` (push `develop` 2026-04-30).

### 3.1 Refactor `ActivityLogsPanel.tsx` ✅

**Archivo:** `frontend/src/components/settings/ActivityLogsPanel.tsx` (REFACTOR mayor: +534 −249).

Cambios:
- **Barra de filtros colapsable**: usuario ▼, módulo ▼, tipo entidad ▼, fechas desde/hasta, chips multi-select de acción, toggle "Incluir accesos".
- **Búsqueda con debounce** 300ms en `q`, botón clear.
- **Paginación REAL** usando `total` y `total_pages` (antes era trick basado en `length === 20`).
- **Filas más densas**: 1 línea con badge acción, usuario, módulo, entidad → label, resumen inline. IP/UA ocultos en fila (tooltip al hover sobre avatar).
- **Modal "Detalle"** sólo cuando `needsModal()` retorna true (diff > 3 cambios o bulk_asistencia). Sub-componentes existentes (`CompactDiffViewer`, `LegacyDiffViewer`, `BulkAsistenciaViewer`, `GenericDetailView`) preservados sin cambios funcionales.
- **Botón Export CSV** descarga vía blob con auth (axios `responseType: 'blob'`). Reusa `buildQuery()` para que el archivo refleje los filtros activos.
- **Auto-reset** de página a 1 al cambiar cualquier filtro.

### 3.2 Helpers nuevos ✅

- `inlineResumen(parsed)` — extrae texto inline del JSON detalle (resumen, bulk, diff o plain object).
- `needsModal(parsed)` — decide si una fila amerita modal (bulk siempre; diff/compact con > 3 cambios).

### 3.3 Tipo `Log` extendido ✅

Agregadas `entidad_tipo` y `entidad_label`. `logNormalizer.ts` no necesita cambios — sigue parseando el `detalle` JSON como antes.

**Resultado:** tsc verde. Backend tests 235/235 sin cambios (sprint sólo frontend).

---

## 🟢 Sprint 4 — Docs + cleanup — COMPLETADO

**Commit:** _este commit_.

### 4.1 RUNBOOK § 14 ✅

**Archivo:** `docs/RUNBOOK.md` — sección "§ 14. Historial de Actividad" agregada.

Contenido:
- Qué es y cómo funciona el middleware (auto-log POST/PUT/DELETE + exclusiones).
- Tabla `logs_actividad`: columnas, índices, FKs.
- Lista de módulos en `ENTIDAD_RESOLVERS` y guía paso-a-paso para agregar uno nuevo.
- Filtros disponibles en `/api/logs` y export CSV.
- Permisos: `sistema.logs.ver` (sin cambio).
- Por qué los logins están ocultos por default.
- Errores comunes específicos del subsistema.

### 4.2 Centralizar constantes ✅ (hecho en Sprint 1)

`backend/src/config/log-config.js` ya creado en Sprint 1 con todas las constantes compartidas. Importado desde `middleware/logger.js` y `routes/logs.routes.js`.

### 4.3 Status update ROADMAP ✅

Este documento actualizado al cerrar el Sprint 4.

---

## 🧪 Verificación end-to-end

### Smoke tests por sprint (validados manualmente en staging)

**Sprint 1 ✅**
- Crear/editar/eliminar trabajador → log incluye `entidad_tipo='trabajador'` y `entidad_label='Juan Pérez'`.
- Crear transferencia → `entidad_label = 'TRF-2026-001'`.
- DELETE → label resuelto desde tabla maestra.

**Sprint 2 ✅**
- `GET /api/logs?modulo=trabajadores&accion=DELETE&desde=2026-04-01` retorna sólo deletes de abril.
- `total_pages` correcto.
- `GET /api/logs/export` descarga CSV legible en Excel ES sin caracteres rotos.

**Sprint 3 ✅**
- Filtros operan sin recargar página completa.
- Toggle "Incluir accesos" agrega filas LOGIN.
- Botón Export descarga CSV con filtros activos.
- Paginación real "Página X de Y".
- IP/UA ocultos en lista, visibles al hover/click en detalle.

**Sprint 4 ✅**
- RUNBOOK § 14 actualizado.
- Este ROADMAP con todos los items en ✅.
- `log-config.js` importado desde middleware y endpoint.

### Acción manual aplicada en staging

Tras deploy del Sprint 1: migración 041 corrida vía cPanel → Setup Node.js App → Run JS script → `migrate`. Idempotente — segura para re-ejecutar.

**Pendiente para producción:** mismo paso al mergear `develop → main`.

---

## 📂 Critical files

### Backend nuevos/modificados

| Archivo | Tipo | Descripción |
|---------|------|-------------|
| `backend/db/migrations/041_historial_entidad_y_indices.sql` | NUEVO | Columnas entidad + 4 índices compuestos |
| `backend/src/middleware/logger.js` | REFACTOR | Helper `resolveEntidad`, INSERT con columnas nuevas |
| `backend/src/routes/logs.routes.js` | REFACTOR | Filtros completos + endpoints `/filtros` y `/export` |
| `backend/src/config/log-config.js` | NUEVO | Constantes compartidas |
| `backend/tests/logger_entidad.test.js` | NUEVO | 13 tests del helper |
| `backend/tests/logs_filtros.test.js` | NUEVO | 17 tests de filtros y export |
| `backend/tests/asistencia_logs.test.js` | UPDATE | Posiciones de params del INSERT |

### Frontend modificados

| Archivo | Tipo | Descripción |
|---------|------|-------------|
| `frontend/src/components/settings/ActivityLogsPanel.tsx` | REFACTOR mayor | Panel completo con filtros, paginación real, resumen inline, export |

### Docs

| Archivo | Tipo |
|---------|------|
| `ROADMAP_HISTORIAL_AUDITORIA.md` | Este doc — checklist completado |
| `docs/RUNBOOK.md` | Sección § 14 nueva |

---

## 📌 Notas para futuras sesiones

- **Migración 041 es idempotente** (patrón heredado de 037-040). Re-correrla en producción es seguro.
- **Logs viejos** quedan con `entidad_tipo = NULL` y `entidad_label = NULL`. Frontend los maneja con fallback a `item_id`.
- **El feature Sábados Extra** ya está cubierto — el resolver `'sabados-extra'` está activo en `ENTIDAD_RESOLVERS`.
- **El permiso `sistema.logs.ver`** ya estaba definido — sin cambios en `permisos.config.js`.
- **Si en el futuro se necesita severidad tipada** (INFO/WARNING/ERROR): agregar columna `severidad ENUM(...) DEFAULT 'INFO'` con backfill basado en `accion`. No incluido en este alcance.
- **Si en el futuro se necesita drill-down de entidad**: el índice `idx_logs_entidad (entidad_tipo, entidad_label)` ya soporta esa query eficientemente.
- **Si la tabla supera 1M filas:** considerar partición por `YEAR(created_at)` o archivo a tabla `logs_actividad_archivo`. No incluido en este alcance.

---

## 📈 Resumen de progreso

| Sprint | Estado | Commit | Items principales |
|--------|--------|--------|-------------------|
| 1 — Backend schema + middleware | ✅ COMPLETADO | `9915056` | Migración 041, resolveEntidad, log-config.js, 13 tests |
| 2 — Backend filtros + export | ✅ COMPLETADO | `691abf6` | Filtros completos en /logs, /filtros, /export CSV, 17 tests |
| 3 — Frontend UX | ✅ COMPLETADO | `5c6ab15` | Panel filtros + resumen inline + export + paginación real |
| 4 — Docs + cleanup | ✅ COMPLETADO | _este commit_ | RUNBOOK § 14, status update |

**Tests del proyecto:** 205 → 235 (+30 tests añadidos: 13 logger_entidad + 17 logs_filtros).

---

> **Cierre:** El Historial de Actividad pasó de "tedioso y mal estructurado" a herramienta de auditoría usable. Validado en staging. Pendiente: merge a `main` cuando se confirme el comportamiento en producción + correr `migrate` en cPanel producción para aplicar la 041.
