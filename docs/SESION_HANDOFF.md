# Handoff: Módulo de Asistencia — Estado al 2026-04-20

> **Documento de continuidad.** Generado al final de una sesión de trabajo para retomar desde otra máquina. Resume el contexto, lo que se implementó, y lo que queda pendiente.

---

## Objetivo de la sesión

Auditar y mejorar el módulo de Asistencia de Bóveda LOLS. El detonante fue que usuarios reportaban ser expulsados de la app varias veces por hora (3–4 logouts forzados diarios), y que un flujo concreto —guardar asistencia día por día— era inusablemente lento y propenso a interrupciones.

El trabajo se organizó en olas por severidad:

| Ola | Scope | Estado |
|-----|-------|--------|
| Ola 1 — P0 | Bugs críticos (features rotos en producción) | ✅ Implementado y mergeado |
| Ola 2 — P1 | UX: flujo día-a-día, duplicados, dead code | 🔲 Pendiente |
| Ola 3 — P2 | Performance: índices, paginación, transacciones | 🔲 Pendiente |
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

> **Acción pendiente en producción:** correr `030_tipos_ausencia_es_justificada.sql` vía cPanel → Setup Node.js App → Run JS script → `migrate`, o correrla manual con phpMyAdmin. Verificar antes con `DESCRIBE tipos_ausencia;` para no duplicar la columna.

---

## Lo que falta implementar

### Ola 2 — P1: UX

#### P1.1 — Endpoint batch + botón "Repetir día anterior"

**Qué es:** el usuario guardaba asistencia día por día (1 request por día), muy lento y propenso a interrupciones. Se propone:
- **Backend:** nuevo endpoint `POST /api/asistencias/batch` que recibe `{ registros: [...] }` y hace upsert transaccional de todos en un único request.
- **Frontend:** botón "Repetir día anterior" en `frontend/src/pages/Attendance.tsx` que precarga el estado del día previo en todos los trabajadores visibles.

Archivos a modificar:
- `backend/src/routes/asistencias.routes.js` — agregar ruta `POST /batch`
- `backend/src/services/asistencia.service.js` — agregar método `batchSave(registros, registradoPor)`
- `frontend/src/pages/Attendance.tsx` — botón + lógica de copia

#### P1.2 — Botones de estado duplicados

- Archivo: `frontend/src/pages/Attendance.tsx` líneas ~278–299 y ~332–349
- El mismo bloque de botones de estado se renderiza dos veces (probablemente de un merge mal resuelto)
- Eliminar el bloque duplicado, dejar solo el que tiene los handlers correctos

#### P1.3 — Estado muerto `loadingPeriods`

- Archivo: `frontend/src/pages/Attendance.tsx`
- `const [loadingPeriods, setLoadingPeriods] = useState(false)` nunca se usa en JSX
- Eliminar

#### P1.4 — Modal dentro de modal

- Editar una ausencia desde el modal de detalle abre un segundo modal encima
- Reemplazar por un único modal con modo view/edit toggle

---

### Ola 3 — P2: Performance

#### P2.1 — Falta paginación en reportes grandes

- `generarExcel` y `getAlertasFaltas` traen todos los registros sin LIMIT
- Fix: streaming en Excel export, paginación en endpoints de reporte

#### P2.2 — Race condition en `cancelarPeriodo`

- Lee y escribe sin transacción/lock
- Fix: `beginTransaction` + `SELECT ... FOR UPDATE` sobre el período

#### P2.3 — Índices faltantes (ya hay una migración 025 pero incompleta)

- Faltan: `asistencia(obra_id, fecha)` y `log_asistencia(asistencia_id, fecha_modificacion DESC)`
- Fix: migración `031_asistencia_indexes_v2.sql`

---

### Ola 4 — P3: Features (backlog, sin urgencia)

- Bulk import de asistencia por CSV
- Vista semanal (además de diaria/mensual)
- Notificación al supervisor en falta injustificada
- Auditoría visible en modal de detalle ("última modificación: X, ayer 15:32")
- Export formato Previred / Libro de Remuneraciones

---

## Contexto técnico clave

| Tema | Detalle |
|------|---------|
| Schema de horarios | `configuracion_horarios` tiene `hora_colacion_inicio` / `hora_colacion_fin` (TIME). La columna `colacion_minutos` **no existe** (eliminada por migración 007). |
| JWT expira | Por defecto `8h` (configurable con `JWT_EXPIRES_IN` en `.env` de cPanel). No hay refresh token. No hay sliding session. |
| Version de rol (`rv`) | Embebida en el JWT; se incrementa al cambiar permisos. Todos los usuarios del rol son deslogueados al siguiente request. |
| Tests | 89 tests, todos en `backend/`. Usan mocks de DB. Correr con `cd backend && npm test`. |
| Deploy | Push a `develop` → staging automático. Push a `main` → producción. SIEMPRE probar en staging primero. |
| Worktree | Esta sesión usó el worktree `.claude/worktrees/stupefied-moore`. Rama de trabajo: `fix/asistencia-p0-column-bugs` (ya mergeada y puede borrarse). |

---

## Archivos clave del módulo

| Archivo | Propósito |
|---------|-----------|
| `backend/src/services/asistencia.service.js` | Toda la lógica: bulkCreate, generarExcel, calcularHorasExtras, saveHorarios, etc. |
| `backend/src/routes/asistencias.routes.js` | Endpoints REST del módulo |
| `backend/src/services/config-horarios.service.js` | Servicio dedicado a horarios (el que usa el frontend real vía `/config-horarios/`) |
| `frontend/src/pages/Attendance.tsx` | Página principal de asistencia (tiene duplicados — ver P1.2) |
| `frontend/src/hooks/attendance/useAttendanceData.ts` | Carga de datos de asistencia |
| `frontend/src/hooks/attendance/useAttendanceActions.ts` | Acciones (guardar, actualizar) |
| `frontend/src/components/settings/HorariosConfigPanel.tsx` | UI de configuración de horarios |
| `frontend/src/types/entities.ts` | Tipos TS: `Asistencia`, `ConfiguracionHorario`, `TipoAusencia` |
| `backend/db/migrations/004_asistencia.sql` | Schema base (le faltaba `es_justificada`) |
| `backend/db/migrations/030_tipos_ausencia_es_justificada.sql` | Migración que agrega la columna faltante |

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

# Verificar tests
cd ../backend && npm test   # debe pasar 89/89

# Arrancar desarrollo
cd backend && npm run dev
cd ../frontend && npm run dev
```

El plan completo está en `.claude/plans/peaceful-baking-fountain.md` (si tienes acceso al sistema de archivos del equipo original) o resumido en este documento.

La siguiente tarea sugerida es **P1.1: endpoint batch + botón "Repetir día anterior"** — es la que mayor impacto tiene en el usuario que guardaba asistencia día a día.
