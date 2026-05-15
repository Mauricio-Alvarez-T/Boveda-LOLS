# Roadmap — Permisos Financieros ($) y Overrides

> **Estado:** ✅ COMPLETADO. Sprints 1-3 ejecutados y desplegados a staging.
> **Rama de trabajo:** `develop`
> **Plan original:** `C:\Users\maatr\.claude\plans\regalon-necesito-contruir-una-sorted-diffie.md`

---

## 📊 Contexto

La jefatura solicitó que sólo personal autorizado vea información relacionada con dinero. Hoy los permisos eran por módulo (`inventario.ver`, `asistencia.ver`, etc.) — cualquier usuario con acceso al módulo veía todos los campos $ del módulo.

**Datos sensibles antes del sprint (sin gating granular):**

| Origen | Campos $ |
|---|---|
| `items_inventario` | `valor_compra`, `valor_arriendo` |
| `ubicaciones_stock` | `valor_arriendo_override` |
| `facturas_inventario` | `monto_neto` |
| `factura_items` | `precio_unitario` |
| `registro_bombas_hormigon` | `costo` |
| `descuentos_obra` | `porcentaje` |
| Resumen Ejecutivo | `valor_bruto`, `valor_neto`, `subtotal_bruto`, `costo_externo` |
| Asistencia | `horas_extra`, `horas_sabado` (insumo cálculo pago) |
| Trabajadores | Sueldo, anticipo, finiquito (campos futuros) |

---

## ✅ Decisiones del usuario (Phase 3)

| Decisión | Elección | Implicación |
|---|---|---|
| **Granularidad** | Granular por feature | 10 permisos nuevos en módulo "Financiero" |
| **Defensa** | Frontend + Backend | Backend omite valores en JSON, frontend esconde UI |
| **UI Overrides** | Sección dedicada al inicio | Border amber, badge "Sensible", icono $ |
| **Default** | Solo Super Admin | Política deny-by-default, admin asigna manualmente |

---

## 🟢 Sprint 1 — Backend: permisos + gating endpoints — COMPLETADO

**Commit:** `0a46733` (push `develop` 2026-05-07).

### 1.1 Nuevos permisos en `permisos.config.js` ✅

10 entradas con módulo `'Financiero'`:

| Clave | Orden |
|---|---|
| `inventario.costos.ver` | 1 |
| `inventario.costos.editar` | 2 |
| `inventario.facturas.ver` | 3 |
| `inventario.facturas.gestionar` | 4 |
| `inventario.bombas.ver_costos` | 5 |
| `inventario.descuentos.gestionar` | 6 |
| `inventario.resumen.ver_valores` | 7 |
| `asistencia.horas_extra.ver` | 8 |
| `trabajadores.financiero.ver` | 9 |
| `trabajadores.financiero.editar` | 10 |

Adicionalmente: export `PERMISOS_FINANCIEROS` (array) para consumo del frontend al detectar sección destacada y del helper de sanitización.

### 1.2 Migración 043 — `043_permisos_financieros.sql` ✅

Patrón idempotente:
- `INSERT IGNORE INTO permisos_catalogo` con las 10 entradas (FK requirement para el siguiente paso).
- `INSERT IGNORE INTO permisos_rol_v2` asignando los 10 al `rol_id=1` (Super Admin).
- `UPDATE roles SET version = version + 1 WHERE id = 1` (fuerza re-login).

### 1.3 Helper `sanitizeFinancialFields.js` ✅

8 funciones puras:
- `has(perms, key)` — predicado.
- `sanitizeItemCosto(item, perms)` — omite valor_compra/valor_arriendo/valor_arriendo_override.
- `sanitizeItemsCosto(arr, perms)` — wrapper sobre array.
- `sanitizeResumenInventario(resumen, perms)` — omite totales monetarios + recursivo en `top_obras` y `bombas`.
- `sanitizeRegistroBomba(reg, perms)` — omite `costo`.
- `sanitizeRegistrosBomba(arr, perms)` — wrapper sobre array.
- `sanitizeTrabajadorFinanciero(t, perms)` — omite sueldo/anticipo/bono/etc (preventivo).
- `guardEditCostos(body, perms)` — bloquea PUT que toca campos $ sin permiso.

### 1.4 Gating en routes ✅

| Endpoint | Cambio |
|---|---|
| `GET /api/inventario/dashboard-ejecutivo` | `sanitizeResumenInventario` |
| `GET /api/inventario/resumen` | `sanitizeResumenInventario` |
| `GET /api/inventario/stock/obra/:obraId` | `sanitizeItemsCosto` |
| `GET /api/inventario/stock/bodega/:bodegaId` | `sanitizeItemsCosto` |
| `PUT /api/inventario/stock` | `guardEditCostos` bloquea `valor_arriendo_override` |
| `PUT /api/inventario/items/bulk` | Bloquea bulk si algún item trae `valor_compra/arriendo` |
| `PUT /api/inventario/stock/bulk` | Bloquea bulk si algún adjustment trae `valor_arriendo_override` |
| `PUT /api/inventario/descuento/obra/:obraId` | Requiere `inventario.descuentos.gestionar` (antes `inventario.editar`) |
| `GET /api/facturas-inventario` | Requiere `inventario.facturas.ver` (antes `inventario.ver`) |
| `POST /api/facturas-inventario` | Requiere `inventario.facturas.gestionar` (antes `inventario.crear`) |
| `PUT /api/facturas-inventario/:id/anular` | Requiere `inventario.facturas.gestionar` (antes `inventario.eliminar`) |
| `GET /api/bombas-hormigon` | `sanitizeRegistrosBomba` |
| `GET /api/bombas-hormigon/resumen/:obraId` | Omite `costo_externo/total` sin permiso |
| `POST /api/bombas-hormigon` | Descarta `costo` del body si no tiene permiso |
| `PUT /api/bombas-hormigon/:id` | 403 si el body intenta editar `costo` sin permiso |
| `GET /api/asistencias/exportar/excel` | Pasa `incluirHorasExtra` al service según permiso |

### 1.5 Asistencia service — `generarExcel()` ✅

Nueva opción `{ incluirHorasExtra: boolean }`. Cuando es false (default true para retrocompat), las celdas HE y Sábados Extra quedan en blanco — estructura del Excel preservada.

### 1.6 Tests Sprint 1 ✅

**Archivo nuevo:** `backend/tests/permisos_financieros.test.js` — 28 tests cubriendo:
- Catálogo: 10 claves financieras, módulo correcto, `PERMISOS_FINANCIEROS` sincronizado.
- `has()`: presente/ausente/array nulo.
- Sanitizers: con/sin permiso, null/undefined, no mutación, recursión en estructuras anidadas.
- `guardEditCostos`: bloquea/permite según body + permisos.

**Resultado:** 274/274 tests pasando (246 antes + 28 nuevos).

---

## 🟢 Sprint 2 — Frontend: hide UI + sección destacada — COMPLETADO

**Commit:** `a3574d8` (push `develop` 2026-05-07).

### 2.1 Sección "Datos Financieros" destacada ✅

**Archivos:**
- `frontend/src/components/settings/PermisosUsuarioPanel.tsx` (Overrides por usuario)
- `frontend/src/components/settings/PermisosRolPanel.tsx` (Permisos por rol)

Render PRIMERO con:
- Border `border-amber-300`, fondo `bg-amber-50/40`.
- Header con `💵` + título "Datos Financieros" + badge "Sensible".
- Banner explicativo en `text-amber-800`.
- Cada permiso muestra icono `$` antes del nombre.

Resto de módulos renderiza después, `.filter(([modulo]) => modulo !== 'Financiero')`.

### 2.2 Esconder campos $ en formularios y dashboards ✅

| Componente | Cambio |
|---|---|
| `ItemInventarioForm.tsx` | Inputs valor_compra y valor_arriendo ocultos sin `inventario.costos.ver`. Disabled si tiene `ver` pero no `editar`. Grid 3→1 col. |
| `CurrencyInput.tsx` | Nuevo prop `disabled` (gris + cursor-not-allowed) |
| `ResumenEjecutivoPanel.tsx` | KpiCard "Valor obras" oculto sin `inventario.resumen.ver_valores`. Sección "Top Obras" oculta. Bombas: card "Costo ext." oculto sin `inventario.bombas.ver_costos`. |
| `BombasHormigonTab.tsx` | StatCard "Costo Total" oculto sin permiso. |
| `AttendanceDailyTab.tsx` | 3 inputs HE (compact lg, compact md, expanded) ocultos sin `asistencia.horas_extra.ver`. Grid del expanded pasa a 1 col. |

### 2.3 Resultado tsc ✅

`npx tsc --noEmit` verde. Tests backend siguen en 274/274.

---

## 🟢 Sprint 3 — Docs — COMPLETADO

**Commit:** _este commit_.

### 3.1 RUNBOOK § 15 ✅

Sección nueva con:
- Lista de los 10 permisos + qué gatean.
- Guía operacional de quién necesita qué.
- Cómo asignar a rol o usuario.
- Defensa en profundidad (backend + frontend).
- Cómo agregar un permiso $ nuevo a futuro.
- Operación de migración 043 en producción.

### 3.2 ROADMAP doc ✅

Este archivo.

---

## 🧪 Verificación end-to-end

### Backend tests
```
cd backend && npm test
→ Test Suites: 26 passed, 26 total
→ Tests:       274 passed, 274 total
```

### Frontend tsc
```
cd frontend && npx tsc --noEmit
→ (sin output, verde)
```

### Smoke tests staging (validar manualmente tras deploy)

**Sprint 1**
- [ ] Reiniciar backend en staging → log de `syncCatalogoEnArranque()` muestra 10 permisos nuevos.
- [ ] GET `/api/inventario/stock/obra/1` como usuario sin `inventario.costos.ver` → ítems NO contienen `valor_compra`.
- [ ] PUT `/api/inventario/stock` con `valor_arriendo_override` sin permiso → 403 con mensaje claro.
- [ ] GET `/api/facturas-inventario` sin `inventario.facturas.ver` → 403.
- [ ] GET `/api/asistencias/exportar/excel` sin `asistencia.horas_extra.ver` → Excel con columnas HE en blanco.

**Sprint 2**
- [ ] Login como Super Admin → ve todo (regresión).
- [ ] Modal "Permisos de Usuario" (Overrides) muestra sección "Datos Financieros" destacada al inicio.
- [ ] Modal "Editar Rol" muestra misma sección destacada.
- [ ] Crear rol "Operario" sin permisos $, asignar a un usuario, login con ese usuario → no ve columnas $.
- [ ] Editar ítem como usuario con `inventario.costos.ver` pero NO `inventario.costos.editar` → campos $ visibles pero disabled.

**Sprint 3**
- [ ] RUNBOOK § 15 actualizado.
- [ ] Este ROADMAP con todos los items en ✅.

### Acción manual para producción

Tras merge `develop → main`:
1. cPanel → Setup Node.js App → Run JS script → `migrate`.
2. Migración 043 es idempotente — segura de re-correr.
3. Super Admin se desloguea automáticamente (bump version) — re-loguear para recibir los permisos $.

---

## 📂 Critical files

### Backend nuevos/modificados

| Archivo | Tipo |
|---|---|
| `backend/src/config/permisos.config.js` | MOD (+10 permisos + export PERMISOS_FINANCIEROS) |
| `backend/db/migrations/043_permisos_financieros.sql` | NUEVO |
| `backend/src/utils/sanitizeFinancialFields.js` | NUEVO |
| `backend/src/routes/inventario.routes.js` | MOD (sanitización + guards) |
| `backend/src/routes/facturas-inventario.routes.js` | MOD (checkPermission $) |
| `backend/src/routes/bombas-hormigon.routes.js` | MOD (sanitización + guards) |
| `backend/src/routes/asistencias.routes.js` | MOD (pasa incluirHorasExtra) |
| `backend/src/services/asistencia.service.js` | MOD (opción incluirHorasExtra en generarExcel) |
| `backend/tests/permisos_financieros.test.js` | NUEVO (28 tests) |

### Frontend modificados

| Archivo | Tipo |
|---|---|
| `frontend/src/components/settings/PermisosUsuarioPanel.tsx` | MOD (sección destacada $) |
| `frontend/src/components/settings/PermisosRolPanel.tsx` | MOD (sección destacada $) |
| `frontend/src/components/settings/ItemInventarioForm.tsx` | MOD (hide $ por permiso) |
| `frontend/src/components/ui/CurrencyInput.tsx` | MOD (prop disabled) |
| `frontend/src/components/inventario/ResumenEjecutivoPanel.tsx` | MOD (hide KPIs/ranking $) |
| `frontend/src/components/inventario/BombasHormigonTab.tsx` | MOD (hide StatCard costo total) |
| `frontend/src/components/attendance/AttendanceDailyTab.tsx` | MOD (hide inputs HE) |

### Docs

| Archivo | Tipo |
|---|---|
| `ROADMAP_PERMISOS_FINANCIEROS.md` | NUEVO (este doc) |
| `docs/RUNBOOK.md` | § 15 nueva |

---

## 📌 Notas para futuras sesiones

- **Política deny-by-default**: si surge un nuevo permiso $, NO se concede automáticamente a roles existentes — admin debe asignarlo manualmente. Esto previene regresiones de seguridad.
- **`FacturasTab.tsx`** está huérfano hoy (no importado). Backend ya está gateado. Cuando se integre al menú, sólo agregar `RequirePermission` wrapper.
- **Trabajadores sin campos $ en BD aún**: los permisos `trabajadores.financiero.*` están listos para cuando se agreguen `sueldo_base`, `anticipo`, etc. El helper `sanitizeTrabajadorFinanciero` ya cubre los campos esperados.
- **Excel asistencia**: las columnas HE quedan en blanco sin permiso (estructura preservada). Si se quiere ocultar las columnas completamente, modificar el header builder del Excel.
- **Auditoría**: cada toggle de override queda en `logs_actividad` vía middleware general (Sprint Historial § 14). Verificación a posteriori posible.

---

## 📈 Resumen de progreso

| Sprint | Estado | Commit | Items principales |
|---|---|---|---|
| 1 — Backend permisos + gating | ✅ COMPLETADO | `0a46733` | 10 permisos, migración 043, helper sanitización, 28 tests |
| 2 — Frontend hide + sección destacada | ✅ COMPLETADO | `a3574d8` | Sección amber en Overrides + RolPanel, hide UI por permiso |
| 3 — Docs | ✅ COMPLETADO | _este commit_ | RUNBOOK § 15, ROADMAP |

**Tests del proyecto:** 246 → 274 (+28).
**Permisos del sistema:** 60 → 70 (+10 financieros).

---

> **Cierre:** Información $ ahora gateada por permisos granulares. Defensa en profundidad backend + frontend. Política deny-by-default. Pendiente: merge a `main` + correr `migrate` en cPanel producción para aplicar la 043.
