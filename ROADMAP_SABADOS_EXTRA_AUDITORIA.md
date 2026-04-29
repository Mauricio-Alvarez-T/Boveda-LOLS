# Roadmap — Auditoría completa del feature "Sábados Extra"

> **Estado actual:** Sprints 1, 2, 3 y 4 completados. Auditoría cerrada.
> **Rama de trabajo:** `develop`
> **Plan original:** `C:\Users\maatr\.claude\plans\regalon-necesito-contruir-una-sorted-diffie.md`

---

## 📊 Contexto

Auditoría exhaustiva (3 Explore agents) del feature de trabajo extraordinario de sábado. Detectó:

| Severidad | # | Naturaleza |
|-----------|---|------------|
| 🔴 CRITICAL | 5 | Race conditions, validación fecha, soft delete débil, citar finiquitado/obra inactiva |
| 🟠 HIGH | 8 | RBAC, N+1, validación feriado, audit columns, `as any` lookup |
| 🟡 MEDIUM | 4 | Índice fecha, tests concurrencia, parseHoras backend, memoización |
| 🔵 LOW | 3 | aria-labels, magic numbers, docs RUNBOOK |

### Decisiones del usuario
1. **Alcance:** todos los niveles (CRITICAL → LOW).
2. **Cancelar:** marcar trabajadores como `cancelado` en `sabados_extra_trabajadores` (preserva auditoría).
3. **Pago/multiplicador:** fuera de alcance.
4. **Reporte mensual:** integrar horas de sábado al Excel mensual (columna nueva).

---

## ✅ Sprint 1 — Backend CRITICAL (race conditions + validaciones + estado trabajadores)

### 1.1 Migración 040 — `sabados_extra_audit_y_estado.sql` ✅
- Columna `estado` ENUM('citado','asistio','no_asistio','cancelado') en `sabados_extra_trabajadores` (default `citado`).
- Columna `actualizado_por INT NULL` + FK a `usuarios(id)`.
- Backfill `estado` desde `asistio` (1→asistio, 0→no_asistio, NULL→citado). Si la cabecera está cancelada, marca a sus trabajadores como `cancelado`.
- 2 permisos nuevos (`asistencia.sabados_extra.editar`, `asistencia.sabados_extra.cancelar`) en `permisos_catalogo` con backfill: roles que tenían `crear` los reciben automáticamente.
- Patrón idempotente (information_schema + PREPARE/EXECUTE), tipos INT signed.

### 1.2 Race conditions con SELECT FOR UPDATE ✅
**Archivo:** `backend/src/services/sabadosExtra.service.js`

Todas las transiciones de estado envuelven la lectura inicial con `SELECT ... FOR UPDATE`:
- `crearCitacion` → lockea `(obra_id, fecha)` antes del INSERT (previene 2 admins creando misma citación).
- `editarCitacion` → lockea cabecera por `id`.
- `registrarAsistencia` → lockea cabecera durante UPDATE de detalles.
- `cancelar` → lockea cabecera durante UPDATE de cabecera + detalle.

### 1.3 Validación de fecha robusta ✅
**Archivo:** `backend/src/services/sabadosExtra.service.js` `validarFechaSabado()`

- Solo sábados (`Date.getDay() === SATURDAY`).
- Rechaza fechas pasadas (`dateOnly < today`).
- Rechaza fechas > 1 año adelante (`ONE_YEAR_DAYS`).

### 1.4 Validar trabajador y obra activos ✅
- Helper `validarObraYTrabajadores()` queryea `obras.activa` + `trabajadores.activo`/`fecha_desvinculacion`.
- 400 con detalle de IDs problemáticos. Se invoca en `crearCitacion` y `editarCitacion`.

### 1.5 Validar feriado opt-in ✅
- Helper `validarFeriado()` consulta tabla `feriados` por `fecha = ? AND activo = 1`.
- Si hay feriado y `payload.acepta_feriado` no está seteado → 409 con mensaje específico.
- UI ofrece reintento con confirmación explícita.

### 1.6 Soft delete con estado en trabajadores ✅
- `cancelar()` ahora hace UPDATE de cabecera (`estado='cancelada'`) + UPDATE de trabajadores (`estado='cancelado'`).
- Preserva la lista original de citados para auditoría histórica.

### 1.7 Tests Sprint 1 ✅
**Archivos:**
- `backend/tests/sabados_extra.test.js` (reescrito para nuevo flujo): 25 tests cubriendo todas las validaciones.
- `backend/tests/sabados_extra_concurrencia.test.js` (NUEVO): 19 tests vía inspección estática del código fuente — verifica `FOR UPDATE`, audit columns, RBAC granular.

**Total backend:** 172 → 205 tests pasando (+33).

---

## ✅ Sprint 2 — Backend HIGH (RBAC + N+1 + audit)

### 2.1 RBAC granular ✅
**Archivo:** `backend/src/routes/sabados-extra.routes.js`

- `PUT /:id/citacion` → permiso `asistencia.sabados_extra.editar` (antes `crear`).
- `DELETE /:id` → permiso `asistencia.sabados_extra.cancelar` (antes `crear`).
- `POST /` y `PUT /:id/asistencia` mantienen sus permisos previos.
- Backfill SQL en migración 040 garantiza que roles existentes con `crear` heredan los nuevos.

### 2.2 N+1 fix en `listar()` ✅
**Antes:** 2 subqueries correlacionadas por fila (`SELECT COUNT(*) ... WHERE t.sabado_id = s.id`).

**Ahora:** `LEFT JOIN sabados_extra_trabajadores t ON t.sabado_id = s.id` + `GROUP BY s.id` con `COUNT(DISTINCT CASE WHEN t.estado = 'asistio' THEN t.id END)` etc.

Filtro de mes: `s.fecha BETWEEN ? AND ?` (BETWEEN plano para usar `idx_fecha`, en lugar de `MONTH()/YEAR()` que rompen el índice).

### 2.3 Validar `trabajadores.length > 0` y `<= 500` ✅
- `crearCitacion` y `editarCitacion` rechazan con 400 si el array está vacío o supera el máximo.

### 2.4 `actualizado_por` en INSERT inicial ✅
- INSERT de cabecera setea `actualizado_por = creado_por` (consistencia inicial).
- INSERT de detalle setea `estado = 'citado'` y `actualizado_por = userId`.

### 2.5 `parseHoras` con coma decimal en backend ✅
- Helper `parseHoras` normaliza `'5,5'` → `5.5`. Aplica en `registrarAsistencia` antes del check `0 ≤ horas ≤ 24`.
- Cubre el caso de un cliente externo enviando JSON con coma decimal directamente.

---

## ✅ Sprint 3 — Frontend + integración reporte mensual

### 3.1 Fix `as any` en `sabadosWhatsApp.ts` ✅
**Archivo:** `frontend/src/components/attendance/sabados/sabadosWhatsApp.ts`

- Generic `agruparPorCargo<T extends { cargo_nombre: string | null; cargo_id: number | null }>` permite acceder a `cargo_id` sin casts.
- Lookup de observaciones por cargo ahora type-safe.

### 3.2 React.memo en WorkerCheckList ✅
**Archivo:** `frontend/src/components/attendance/sabados/WorkerCheckList.tsx`

- Patrón `WorkerCheckListImpl` + `export default React.memo(WorkerCheckListImpl)`.
- Listas de 100+ trabajadores no re-renderizan al tipear en inputs distantes.

### 3.3 useCallback en handlers de filas ✅
**Archivo:** `frontend/src/components/attendance/sabados/SabadoExtraAsistencia.tsx`

- Handlers `setAsistio`, `setHorasRow`, `setObsRow` envueltos en `useCallback` (deps vacías, `setRows` es estable).
- aria-labels específicos en botones Asistió/No, inputs de horas y observaciones.

### 3.4 Reporte mensual Excel — columna SÁB EXTRA ✅
**Archivo:** `backend/src/services/asistencia.service.js` `generarExcel()`

- Query nueva ejecutada antes del loop de hojas: agrupa horas de sábados extra por trabajador en el rango (filtra `estado != 'cancelada'` y `t.estado = 'asistio'`).
- Columna nueva entre `HORAS EXT` y `OBSERVACIONES` titulada **"SÁB EXTRA (h)"** con fondo azul claro.
- Si el reporte filtra por `obra_id`, también filtra sábados extra por esa obra.
- Try/catch defensivo: si la migración 040 no se aplicó, log warning y continúa con map vacío (no rompe el export).

### 3.5 Confirmación feriado en form ✅
**Archivos:** `frontend/src/hooks/attendance/useSabadosExtra.ts` + `frontend/src/components/attendance/sabados/SabadoExtraForm.tsx`

- Hook `crearCitacion` retorna `{ feriadoConflict: string }` cuando backend devuelve 409 con mensaje "feriado".
- Form maneja el conflict con `window.confirm()`. Si usuario acepta, reintenta con `acepta_feriado: true`.

---

## ✅ Sprint 4 — LOW (a11y + docs)

### 4.1 aria-labels en botones de asistencia ✅
- Botones "Asistió" / "No": `aria-label="<apellido> <nombres>: marcar asistió/no asistió"`.
- Inputs de horas y observación con `aria-label` específico por trabajador.

### 4.2 Constante `SATURDAY = 6` ✅
- Definida en backend (`sabadosExtra.service.js`) como constante con comentario.
- Reemplaza el literal `6` en validaciones de fecha.

### 4.3 Documentación en RUNBOOK ✅
**Archivo:** `docs/RUNBOOK.md` § 12.2

Sección nueva con:
- Qué es, tablas, permisos.
- Restricciones operativas (UNIQUE, fecha sábado, no pasada, ≤ 1 año, feriado opt-in, trabajador/obra activos, mínimo 1, máximo 500).
- Cancelación = soft delete por estado.
- Concurrencia con `SELECT FOR UPDATE`.
- Integración con reporte mensual Excel.
- Migraciones 038 y 040.
- Errores comunes (errno 150, hooks order, 409 sin razón obvia).

### 4.4 ROADMAP_SABADOS_EXTRA_AUDITORIA.md ✅
Este documento.

---

## 📈 Resumen de progreso

| Sprint | Estado | Items |
|--------|--------|-------|
| 1 — Backend CRITICAL | ✅ | Migración 040, FOR UPDATE, validaciones fecha/feriado/trabajador/obra, soft delete, 33 tests nuevos |
| 2 — Backend HIGH | ✅ | RBAC granular, N+1 fix, validación trabajadores, audit columns, parseHoras |
| 3 — Frontend + reporte | ✅ | Fix as any, React.memo, useCallback, columna Excel, confirmación feriado |
| 4 — LOW | ✅ | aria-labels, constante SATURDAY, RUNBOOK § 12.2, este doc |

### Tests totales del proyecto
- **Antes:** 172 / 172
- **Después de Sprint 1:** 205 / 205 (+33)
- **TypeScript:** limpio.

---

## 🔧 Acciones pendientes en staging

Una vez el deploy automático suba los cambios a `test.boveda.lols.cl`:

1. **Correr migración 040:**
   - cPanel → Setup Node.js App → Run JS script → `migrate`.
   - Verificar que aparece "✅ 040_sabados_extra_audit_y_estado.sql aplicada".
2. **Smoke tests manuales:**
   - Crear 2 citaciones simultáneas con misma `(obra, fecha)` → la segunda recibe 409 sin corromper datos.
   - Intentar crear citación con fecha pasada → 400.
   - Intentar crear citación para sábado feriado → 409, confirmar y reintentar → OK.
   - Intentar citar trabajador finiquitado → 400 con su ID.
   - Cancelar una citación con asistencia ya registrada → estado pasa a `cancelada` y trabajadores a `cancelado` (queda en BD para auditoría, no aparece en listados).
   - Exportar reporte mensual → verificar columna **"SÁB EXTRA (h)"** entre HORAS EXT y OBSERVACIONES.

---

## 📌 Notas

- La migración 040 es **idempotente**. Re-correrla en producción es seguro.
- Las columnas audit en `sabados_extra_trabajadores` son `NULL` para registros previos. Quedarán populadas cuando esos trabajadores pasen por una nueva transición.
- La columna SÁB EXTRA (h) aparece en TODOS los exports mensuales aunque no haya datos — se llena con 0 cuando no hay sábados registrados.
- El hook `crearCitacion` retorna 3 tipos de resultados: `{ id }` éxito, `{ conflictExistingId }` cuando ya hay citación, `{ feriadoConflict }` cuando es feriado sin flag.
