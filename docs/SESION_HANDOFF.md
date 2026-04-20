# Handoff: Módulo de Asistencia — Estado al 2026-04-20

> **Documento de continuidad.** Generado al final de una sesión de trabajo para retomar desde otra máquina. Resume el contexto, lo que se implementó, y lo que queda pendiente.

---

## Objetivo de la sesión

Auditar y mejorar el módulo de Asistencia de Bóveda LOLS. El detonante fue que usuarios reportaban ser expulsados de la app varias veces por hora (3–4 logouts forzados diarios), y que un flujo concreto —guardar asistencia día por día— era inusablemente lento y propenso a interrupciones.

El trabajo se organizó en olas por severidad:

| Ola | Scope | Estado |
|-----|-------|--------|
| Ola 1 — P0 | Bugs críticos (features rotos en producción) | ✅ Implementado y mergeado |
| Ola 2 — P1 | UX: flujo día-a-día, duplicados, dead code | ✅ **COMPLETADO esta sesión** |
| Ola 3 — P2 | Performance: índices, paginación, transacciones | ✅ **COMPLETADO esta sesión** |
| Ola 4 — P3 | Features nuevos (backlog) | 🔲 Pendiente |

---

## Lo que ya está implementado (en `develop`)

### Fix de expulsiones de sesión — `fix(auth)` commit `0612984`

**Problema:** Race condition entre el arranque de Express y la inicialización de `versionService`. Durante la ventana de arranque (típicamente cada re-spawn de Passenger en cPanel), `versionService.get()` devolvía el fallback `1`, rechazando tokens de usuarios con `rv > 1`. Esto causaba los logouts espurios.

**Archivos modificados:**
- `backend/src/services/version.service.js` — `init()` ahora es idempotente con `initPromise`
- `backend/index.js` — `app.listen()` se ejecuta solo después de que `versionService.init()` resuelva

---

### Ola 1 — P0 bugs — PR #2, commit `5976b90` (mergeado a develop)

**P0.1 — `saveHorarios` escribía en columna eliminada**
- Archivo: `backend/src/services/asistencia.service.js:544`
- La migración `007` eliminó `colacion_minutos` y la reemplazó con `hora_colacion_inicio` / `hora_colacion_fin`
- El INSERT no se actualizó → `ER_BAD_FIELD_ERROR` en producción al guardar horarios
- Fix: INSERT y ON DUPLICATE KEY ahora usan las columnas correctas

**P0.2 — `calcularHorasExtras` producía NaN silencioso**
- Archivo: `backend/src/services/asistencia.service.js:721`
- `h.colacion_minutos / 60` = `undefined / 60` = `NaN`
- `Math.max(0, NaN)` = `NaN` → el Excel de asistencia exportaba celdas vacías/NaN en horas extra/déficit
- Fix: la colación se calcula con `getDiffHours(h.hora_colacion_inicio, h.hora_colacion_fin)`

**P0.3 — `tipos_ausencia.es_justificada` usada pero nunca creada**
- Archivo nuevo: `backend/db/migrations/030_tipos_ausencia_es_justificada.sql`
- El frontend (TypeScript, Settings.tsx, TipoAusenciaForm.tsx) y el seed de migración 005 asumían esta columna
- La migración 004 nunca la creó → el seed fallaba en instalaciones limpias
- Fix: migración idempotente que añade la columna y hace UPDATE para marcar tipos justificados

> **Acción completada en staging:** correr `030_tipos_ausencia_es_justificada.sql` vía cPanel → Setup Node.js App → Run JS script → `migrate`. ✅ Exitoso (después de reescribir la migración sin DELIMITER).

---

## ✅ Ola 2 — P1: UX (COMPLETADO esta sesión)

### P1.1 — Endpoint batch + botón "Repetir día anterior"

**Qué se implementó:**
- **Backend:** nuevo endpoint `POST /api/asistencias/batch` que recibe `{ registros: [...] }` y hace upsert transaccional de todos en un único request.
- **Frontend:** botón "Repetir día anterior" en `frontend/src/pages/Attendance.tsx` que precarga el estado del día previo en todos los trabajadores visibles.

**Archivos modificados:**
- `backend/src/routes/asistencias.routes.js` — ruta `POST /batch` con validación y permisos
- `backend/src/services/asistencia.service.js` — método `batchSave(registros, registradoPor)` con validación por registro
- `frontend/src/hooks/attendance/useAttendanceActions.ts` — callback `repetirDiaAnterior` que busca hasta 7 días atrás (skipeando weekends y feriados)
- `frontend/src/pages/Attendance.tsx` — wired `repetirDiaAnterior` con confirm dialog
- `frontend/src/components/attendance/ui/AttendanceHeaderActions.tsx` — botón móvil/desktop "Repetir día ant."
- `backend/tests/asistencia_batch.test.js` — 4 tests para el nuevo endpoint

**Commits:** `4e45fa3`, `14a3cd4`, `0f72047`

### P1.2 — Botones de estado duplicados (FIXED)

- **Problema:** El mismo bloque de botones de estado se renderizaba dos veces (mal merge de ramas anteriores)
- **Solución:** Extraído un helper `applyStatusChange(worker, estado)` que centraliza la lógica (filtro de TO, clear `tipo_ausencia_id` en presentes, relleno de horarios, auto-expand modal)
- **Resultado:** Botones unificados, handlers consistentes entre mobile/desktop
- **Archivos:** `frontend/src/pages/Attendance.tsx`
- **Commit:** `8e73251`

### P1.3 — Estado muerto `loadingPeriods` (FIXED)

- **Problema:** Variable nunca usada en JSX
- **Solución:** Eliminada del estado
- **Archivos:** `frontend/src/components/attendance/PeriodAssignModal.tsx`
- **Commit:** `8e73251`

### P1.4 — Modal dentro de modal (FIXED)

- **Problema:** Editar una ausencia desde el modal de detalle abría un segundo modal encima (UX confusa)
- **Solución:** Reemplazado `window.confirm()` con patrón inline (botones No / Sí dentro del modal del período)
- **Archivos:** `frontend/src/components/attendance/WorkerCalendar.tsx` (patrón delete + deletingPeriodId state)
- **Commit:** `c82819c`

### Bug fixes reportados por usuarios (FIXED)

**Bug: Alertas duplicadas "Falta 2 lunes (06, 06)"**
- **Causa:** Trabajador con traslado = 2 filas de asistencia el mismo día, ambas en estado F. El count sumaba filas, no días únicos.
- **Fix:** Cambiar `fechas: []` array a `fechasSet: new Set()` para deduplicar. Regla evalúa `fechas.length` después de dedupe.
- **Archivos:** `backend/src/services/asistencia.service.js:getAlertasFaltas()`
- **Tests:** `backend/tests/asistencia_alertas.test.js` (2 tests de dedupe)
- **Commit:** `4e45fa3`

**Bug: Click en alertas iba a vista general, no filtraba trabajador**
- **Causa:** Dashboard linkea a `/attendance?q=NOMBRE`, pero el componente no leía `?q` de URL
- **Fix:** Agregar `useSearchParams` + state sync en `useAttendanceData.ts`. URL param `?q` se sincroniza con estado local y se preserva en refresh.
- **Archivos:** `frontend/src/hooks/attendance/useAttendanceData.ts`, `frontend/src/pages/Attendance.tsx`
- **Commit:** `c6161bf`

---

## ✅ Ola 3 — P2: Performance (COMPLETADO esta sesión)

### P2.1 — Topes de seguridad en exports

**Problema:** `generarExcel` y `getAlertasFaltas` traen todos los registros sin LIMIT → runaway queries que tumban el servidor.

**Solución:**
- `generarExcel`: rechaza rangos >366 días (tope anual razonable) y listas de `trabajador_ids` >2000 (evita IN(...) con miles de valores)
- `getAlertasFaltas`: `LIMIT 50000` defensivo + warn log si se alcanza (para detectar si la regla se queda corta)

**Archivos:** `backend/src/services/asistencia.service.js`
**Commit:** `382ea57`

### P2.2 — Race condition en `cancelarPeriodo`

**Problema:** Lee y escribe sin transacción/lock → dos usuarios cancelando simultáneamente = doble DELETE de asistencias + doble entry en log.

**Solución:**
- Wrapper con `connection.beginTransaction()` + `SELECT ... FOR UPDATE`
- Idempotente: si ya está cancelado (`activo = 0`), retorna sin re-borrar
- `finally` libera la conexión siempre

**Archivos:** `backend/src/services/asistencia.service.js:cancelarPeriodo()`
**Tests:** `backend/tests/asistencia_integral.test.js` (actualizado mock para connection pattern)
**Commit:** `382ea57`

### P2.3 — Índices faltantes

**Problema:** Handoff decía que faltaban `asistencias(obra_id, fecha)` y `log_asistencia(asistencia_id, fecha_modificacion DESC)`. Investigación reveló:
- `asistencias(obra_id, fecha)` ya existe en migración 025
- Solo faltaba el compuesto en `log_asistencia` para evitar filesort en queries de "último cambio"

**Solución:**
- Nueva migración `031_asistencia_indexes_v2.sql` con `idx_log_asist_fecha_desc`
- Idempotente vía `information_schema.STATISTICS` check
- Nota en comentario explicando que la otra ya estaba en 025

**Archivos:** `backend/db/migrations/031_asistencia_indexes_v2.sql` (nueva)
**Commit:** `382ea57`

---

## 🔧 Bug fix: Migración 030 sin DELIMITER

**Problema:** La versión original de 030 usaba `DELIMITER $$ CREATE PROCEDURE ...`. `DELIMITER` es una directiva del CLI mysql, no SQL real → el driver mysql2 la envía tal cual a MariaDB que rechaza con syntax error.

**Solución:** Reescrito con `PREPARE/EXECUTE` + check en `information_schema.COLUMNS`, mismo patrón idempotente que la 031. Funcionalmente idéntico, sin procedures.

**Archivos:** `backend/db/migrations/030_tipos_ausencia_es_justificada.sql` (reescrito)
**Commit:** `d473066`

---

## Contexto técnico clave

| Tema | Detalle |
|------|---------|
| Schema de horarios | `configuracion_horarios` tiene `hora_colacion_inicio` / `hora_colacion_fin` (TIME). La columna `colacion_minutos` **no existe** (eliminada por migración 007). |
| JWT expira | Por defecto `8h` (configurable con `JWT_EXPIRES_IN` en `.env` de cPanel). No hay refresh token. No hay sliding session. |
| Version de rol (`rv`) | Embebida en el JWT; se incrementa al cambiar permisos. Todos los usuarios del rol son deslogueados al siguiente request. |
| Tests | 97 tests (antes 89), todos en `backend/`. Usan mocks de DB. Correr con `cd backend && npm test`. |
| Deploy | Push a `develop` → staging automático. Push a `main` → producción. SIEMPRE probar en staging primero. |
| Migraciones | Idempotentes via `CREATE ... IF NOT EXISTS` o `information_schema` checks. Runner soporta `multipleStatements: true` pero NO entiende `DELIMITER` (es CLI, no SQL). |

---

## Archivos clave del módulo

| Archivo | Propósito |
|---------|-----------|
| `backend/src/services/asistencia.service.js` | Toda la lógica: bulkCreate, batchSave, generarExcel, calcularHorasExtras, saveHorarios, getAlertasFaltas, cancelarPeriodo, etc. |
| `backend/src/routes/asistencias.routes.js` | Endpoints REST del módulo (incluyendo POST /batch nuevos) |
| `backend/src/services/config-horarios.service.js` | Servicio dedicado a horarios |
| `frontend/src/pages/Attendance.tsx` | Página principal de asistencia (refactorizada, sin duplicados) |
| `frontend/src/hooks/attendance/useAttendanceData.ts` | Carga de datos + sync URL params |
| `frontend/src/hooks/attendance/useAttendanceActions.ts` | Acciones: guardar, actualizar, repetirDiaAnterior |
| `frontend/src/components/settings/HorariosConfigPanel.tsx` | UI de configuración de horarios |
| `frontend/src/types/entities.ts` | Tipos TS: `Asistencia`, `ConfiguracionHorario`, `TipoAusencia` |
| `backend/db/migrations/030_tipos_ausencia_es_justificada.sql` | Migración que agrega columna + seeds (reescrita sin DELIMITER) |
| `backend/db/migrations/031_asistencia_indexes_v2.sql` | Índices de performance (nuevo) |

---

## Commits de esta sesión

| Hash | Mensaje | Contenido |
|------|---------|-----------|
| `4e45fa3` | fix+feat(asistencia): alertas dedupe, batch endpoint, repetir día | P1.1 + bug alertas |
| `c6161bf` | fix(asistencia): respetar ?q=RUT al navegar desde alertas | URL sync |
| `8e73251` | refactor(asistencia): unificar handler de cambio de estado | P1.2 + P1.3 |
| `c82819c` | refactor(asistencia): eliminar window.confirm anidado al borrar período | P1.4 |
| `382ea57` | perf+safety(asistencia): índices faltantes, lock en cancelarPeriodo, topes en exports | P2 completo |
| `d473066` | fix(migrations): reescribir 030 sin DELIMITER | Migration 030 fix |

---

## ✅ Verificación completada

- ✅ `npm test` → 97/97 tests pasan
- ✅ `npx tsc --noEmit` → sin errores TS
- ✅ Migración 030 + 031 aplicadas exitosamente en staging
- ✅ Git push a `develop` completado

---

## Qué sigue

### Inmediato (si quieres continuar)

1. **Verificar staging (`test.boveda.lols.cl`):**
   - Abrir Asistencia → cargar trabajadores sin error
   - Cambiar estado, crear/cancelar período, click en alertas

2. **Producción (cuando confirmes que staging está ok):**
   - Push a `main` para deploy automático
   - Correr `migrate` en cPanel para aplicar 030 + 031 en producción

### Próximos en backlog (P3 — features)

- Bulk import de asistencia por CSV
- Vista semanal (además de diaria/mensual)
- Notificación al supervisor en falta injustificada
- Auditoría visible en modal de detalle ("última modificación: X")
- Export formato Previred / Libro de Remuneraciones

---

## Cómo retomar desde otra máquina

```bash
git clone https://github.com/Mauricio-Alvarez-T/Boveda-LOLS.git
cd Boveda-LOLS
git checkout develop
git pull origin develop

# Instalar dependencias
cd backend && npm install
cd ../frontend && npm install

# Verificar tests (debe pasar 97/97)
cd ../backend && npm test

# Arrancar desarrollo
cd backend && npm run dev
cd ../frontend && npm run dev
```

Si necesitas ver el estado completo del plan arquitectónico, ver `.claude/plans/` en la máquina original (si tienes acceso).
