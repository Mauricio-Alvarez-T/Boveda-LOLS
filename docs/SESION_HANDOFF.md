# Handoff: Estado actual — Bóveda LOLS

> **Documento de continuidad.** Actualizado al 2026-04-22. Retomar desde cualquier máquina.

---

## Estado general del proyecto

| Módulo | Estado |
|--------|--------|
| Asistencia (todas las olas) | ✅ Completado y en producción |
| Inventario — Ola 1: Foundations | ✅ Mergeado a `develop` |
| Inventario — Ola 2 Fase 1: push_directo + intra_bodega + devolución | ✅ Implementado (stock diferido al recibir) |
| Inventario — Ola 2 Fase 2: intra_obra + orden_gerencia + rechazo_recepción + cancelación post-despacho | ✅ Implementado (cierra Ola 2) |
| Inventario — Ola 3: Bulk edit | ✅ Completa (items bulk + stock bulk + grids maestros) |
| Inventario — Ola 4: Arriendo + facturación | ⏸ EN PAUSA (esperar jefatura) |
| Inventario — Ola 5: Calidad / backlog | 🔲 Backlog |

---

## Contexto de negocio (crítico para diseñar inventario)

- **LOLS** es la empresa operadora de obras de construcción.
- **Dedalius** es una subempresa ficticia (misma dueña), creada para abaratar costos vía arriendo interno. Dedalius es dueña del inventario (andamios, moldajes, equipos) y arrienda **exclusivamente a LOLS**.
- **Bodegas** = cualquier entrada en la tabla `bodegas`. Son conceptualmente "obras con lógica aparte" — permiten distinguir almacenes de obras sin hardcodear nombres. No hay bodegas "permanentes" ni empresa propietaria fija a nivel tabla; el usuario crea/desactiva vía UI.
- **Obras** = acopio temporal. Todo lo que entra debe volver a bodega al terminar la obra (excepto consumibles).
- **Consumibles** (cemento, tornillos, pintura, etc.) = se ceden, no vuelven a bodega, no generan arriendo.
- **Obra → Obra directa** está permitida por el negocio.
- Ciclo de **arriendo con facturación** en pausa — esperar confirmación jefatura.

---

## Módulo de Asistencia — resumen de lo completado

### P0 (crítico)
- Race condition auth logout espurio → fix `version.service.js` + arranque en orden
- `saveHorarios` escribía en columna eliminada `colacion_minutos` → fix a `hora_colacion_inicio/fin`
- `calcularHorasExtras` producía NaN silencioso → fix cálculo colación
- Migración 030: `tipos_ausencia.es_justificada` nunca creada → migración idempotente

### P1 (UX)
- Endpoint batch + botón "Repetir día anterior" (busca hasta 7 días atrás, skips weekends + feriados)
- Botones estado duplicados → refactor `applyStatusChange` helper
- Modal anidado en períodos → patrón inline confirm
- Click en alertas filtra trabajador (sync `?q=` URL param)

### P2 (performance)
- Topes en exports: >366 días rechaza, >2000 trabajadores rechaza
- Race condition `cancelarPeriodo` → `SELECT ... FOR UPDATE` en transacción
- Migración 031: índice faltante `log_asistencia(asistencia_id, fecha_modificacion DESC)`
- `MAX_REGISTROS=1000` en bulkCreate (413 si excede)

### Limpieza final
- Dead code `es_sabado` eliminado de backend + frontend + tests + seeds
- Migración `032_cleanup_es_sabado.sql` (DROP COLUMN)

**Tests: 104/104 ✅**

---

## Módulo de Inventario — Ola 1 completada (commits en `develop`)

### Commits
| Hash | Contenido |
|------|-----------|
| `14aea36` | feat(inventario): ola 1 foundations — migración 033 + 034 + types |
| `0a56893` | revert(inventario): bodegas sin flags hardcoded — migración 035 + revert 034 |

### Migración 033 — `033_inventario_foundations.sql`
Agrega columnas idempotentes (PREPARE/EXECUTE + information_schema):
- `items_inventario.es_consumible BOOLEAN NOT NULL DEFAULT FALSE`
- `items_inventario.propietario ENUM('dedalius','lols') NOT NULL DEFAULT 'dedalius'`
- `bodegas.es_permanente` ← **revertido por 035** (ver abajo)
- `bodegas.empresa_propietaria` ← **revertido por 035**
- `transferencias.tipo_flujo ENUM('solicitud','push_directo','intra_bodega','intra_obra','orden_gerencia','devolucion') NOT NULL DEFAULT 'solicitud'`
- `transferencias.motivo VARCHAR(255) DEFAULT NULL`
- Índices: `idx_items_propietario`, `idx_transf_tipo_flujo`

### Migración 034 — `034_seed_bodegas_canonicas.sql` (NO-OP)
Originalmente sembraba Cerrillos/Paraguay/Rivas Vicuña. Revertido: bodegas son entradas libres gestionadas por el usuario vía UI. Archivo conservado como no-op para mantener orden de numeración.

### Migración 035 — `035_revert_bodega_flags.sql`
DROPs `bodegas.es_permanente` y `bodegas.empresa_propietaria` (flags innecesarios).

### Frontend `entities.ts`
Nuevos campos en tipos:
- `ItemInventario`: `es_consumible: boolean`, `propietario: 'dedalius' | 'lols'`
- `Transferencia`: `tipo_flujo: 'solicitud' | 'push_directo' | ...`, `motivo: string | null`
- `Bodega`: sin cambios (flags revertidos)

### Verificación staging pendiente
Tras correr `migrate` en cPanel:
```sql
DESCRIBE items_inventario;   -- ver es_consumible, propietario
DESCRIBE transferencias;     -- ver tipo_flujo, motivo
DESCRIBE bodegas;            -- NO debe tener es_permanente ni empresa_propietaria
```
Tests 104/104, `tsc --noEmit` clean.

---

## Inventario — Ola 2 Fase 1 ✅ IMPLEMENTADO

### Cambio semántico de stock (aplica a todos los flujos)
**El stock ahora se mueve al `recibir()`, no al `aprobar()`.**
- `aprobada` → ya **no** decrece stock origen (antes sí).
- `recibida` → decrece origen (por splits) **y** aumenta destino.
- `rechazar/cancelar` → solo reversa si la transferencia es legacy (`stock_reconciliado=FALSE`).

Esto elimina el "stock fantasma" de aprobaciones que nunca se reciben. Contracara: dos aprobaciones pueden comprometer el mismo stock; el segundo receptor lo detectará como discrepancia.

### Migración 036 + script de reconciliación
- `backend/db/migrations/036_stock_reconciliado_flag.sql`: agrega `transferencias.stock_reconciliado BOOLEAN DEFAULT TRUE`. Al aplicar, marca las transferencias `aprobada|en_transito` existentes como `FALSE` (régimen viejo).
- `backend/scripts/fix_stock_transferencias_aprobadas.js`: script idempotente. Re-incrementa stock origen usando splits y marca `stock_reconciliado=TRUE`. **Debe correrse UNA VEZ** en staging y prod post-migrate. Alias npm: `fix-stock-reconciliar`.
- Ver `docs/RUNBOOK.md § 10.1` para el orden exacto.

### Flujos implementados en Fase 1
| # | Flujo | Origen → Destino | Estados | Permiso |
|---|-------|-----------------|---------|---------|
| 1 | solicitud (existente) | bodega → obra | pendiente→aprobada→en_tránsito→recibida | inventario.crear |
| 2 | push_directo (NUEVO) | bodega → obra | en_tránsito→recibida (sin aprobación) | inventario.editar |
| 3 | intra_bodega (NUEVO) | bodega → bodega | recibida (instantáneo, misma tx) | inventario.editar |
| 4 | devolucion (NUEVO) | obra → bodega | pendiente→aprobada→en_tránsito→recibida | inventario.crear |

### Backend
- `transferencia.service.js`: `aprobar()` sin decremento de stock; `recibir()` mueve stock usando splits + flag `stock_reconciliado`. Nuevos: `pushDirecto()`, `intraBodega()`, `devolucion()`. `crear()` acepta `tipo_flujo`, `motivo`, `origen_obra_id`, `origen_bodega_id`.
- `transferencias.routes.js`: rutas `POST /push-directo`, `POST /intra-bodega`, `POST /devolucion`.
- Tests: **113/113 ✅** (104 previos + 9 nuevos en `transferencia_flujos.test.js`).

### Frontend
- `NewMovimientoModal.tsx`: selector de 4 flujos.
- `MovimientoForm.tsx`: form unificado parametrizado por `flujo` (push_directo | intra_bodega | devolucion) — pragmáticamente en un solo componente.
- `TransferenciasPanel.tsx`: botón "Nuevo movimiento" → abre selector → abre form correspondiente.
- `TransferenciasList.tsx`: `tipoFlujoConfig` + badge de tipo_flujo en cada card.
- `TransferenciaDetail.tsx`: badge en header + motivo italicizado.
- `useTransferencias.ts`: métodos `pushDirecto`, `intraBodega`, `devolucion`.

---

## Inventario — Ola 2 Fase 2 ✅ IMPLEMENTADO

Cierra la matriz de 8 flujos. Implementado + tests + typecheck + build OK (**120 tests pasando**).

Backend (`backend/src/services/transferencia.service.js` + `routes/transferencias.routes.js`):
- `intraObra(data, userId)` — obra → obra, flujo con aprobación (reusa `crear()` con `tipo_flujo='intra_obra'`).
- `ordenGerencia(data, userId)` — nace en `en_transito`, motivo obligatorio, origen/destino flexibles.
- `rechazar()` — guard extendido a `pendiente|aprobada|en_transito`. Nueva ruta `PUT /:id/rechazar-recepcion` con permiso `inventario.editar`.
- `cancelar()` — guard extendido a `pendiente|aprobada|en_transito` (sin stock que revertir en régimen nuevo desde en_transito).

Frontend:
- `NewMovimientoModal` — 2 nuevas opciones (intra_obra, orden_gerencia).
- `MovimientoForm` — parametrizado por `FLUJO_SHAPES` con `motivoRequerido`.
- `useTransferencias` — métodos `intraObra`, `ordenGerencia`, `rechazarRecepcion`.
- `TransferenciasPanel` — handlers + 2 modals.
- `TransferenciaDetail` — `canCancelar` extendido a `en_transito`; botón "Rechazar Recepción" visible desde `en_transito`.

### Los 8 flujos del negocio

### Los 8 flujos del negocio

| # | Flujo | Origen → Destino | Aprobación | Estados | Creador |
|---|-------|-----------------|------------|---------|---------|
| 1 | Solicitud estándar | bodega → obra | sí | pendiente→aprobada→en_tránsito→recibida | jefe obra |
| 2 | Devolución | obra → bodega | opcional | aprobada→en_tránsito→recibida | jefe obra |
| 3 | Push directo | bodega → obra/bodega | no | en_tránsito→recibida | bodeguero |
| 4 | Intra-bodega | bodega → bodega | no | recibida (instantáneo) | bodeguero |
| 5 | Intra-obra | obra → obra | opcional | aprobada→en_tránsito→recibida | jefe obra (con permiso) |
| 6 | Orden gerencia | cualquiera → cualquiera | salta pendiente | aprobada→... | PM/dueño |
| 7 | Rechazo recepción | reversa automática | — | en_tránsito→rechazada | bodeguero destino |
| 8 | Cancelación post-despacho | — | — | en_tránsito→cancelada | solicitante/aprobador |

### Regla crítica de stock (Fase 1)
**Stock decrece al recibir** (confirmación del receptor), **NO al aprobar** ni al despachar.
Destino sube al recibir en la misma transacción. Evita stock fantasma.

### Archivos a modificar / crear
Backend:
- `backend/src/services/transferencia.service.js` — refactor + 4 métodos nuevos
- `backend/src/routes/transferencias.routes.js` — 3 rutas nuevas
- `backend/src/config/permisos.config.js` — 3 permisos nuevos: `inventario.push_directo`, `inventario.intra_obra`, `inventario.orden_gerencia`

Frontend:
- `frontend/src/components/inventario/TransferenciasPanel.tsx` — botón "Nuevo movimiento" abre selector
- `frontend/src/components/inventario/TransferenciaDetail.tsx` — acciones condicionales por tipo_flujo
- `frontend/src/components/inventario/TransferenciasList.tsx` — badge tipo de flujo
- Nuevo: `frontend/src/components/inventario/NewMovimientoModal.tsx` — selector de flujo (7 opciones)
- `frontend/src/hooks/useTransferencias.ts`

Tests: 7 nuevos (1 por flujo nuevo). Target: 111 total.

---

## Inventario — Ola 3: Bulk edit ✅ COMPLETA

### Items bulk
- Backend: `PUT /api/inventario/items/bulk` — `itemInventarioBulk.service.js`. MAX_ITEMS=500 → 413, transacción con `SELECT ... FOR UPDATE` + `UPDATE` por fila, rollback total. Devuelve `{ updated, diff }`.
- CRUD genérico `items_inventario.allowedFields` ahora incluye `es_consumible` y `propietario`.

### Stock bulk
- Backend: `PUT /api/inventario/stock/bulk` — `stockBulk.service.js`. MAX_ITEMS=500, XOR `obra_id|bodega_id`, upsert por fila con `<=>` null-safe lookup, rechazo de duplicados pre-transacción. Devuelve `{ updated, created, diff }` con `action: 'create' | 'update'`.

### Frontend
- Tab **Maestro** (gated por `inventario.editar`) con sub-tabs **Ítems** y **Stock por ubicación**:
  - **Ítems**: grid editable de catálogo (descripción, categoría, unidad, valores, consumible, propietario, activo). Buffer dirty, Ctrl/⌘+S, Revertir, aviso `beforeunload`.
  - **Stock por ubicación**: selector de bodega/obra → lista plana de ítems con su cantidad actual, columna "Δ" que refleja el delta, mismo patrón de buffer + atajos. Cambiar de ubicación con cambios pide confirmación.
- Hooks: `useInventarioMaestro` y `useStockMaestro`.

Tests: 8 nuevos sobre ambos servicios (happy, 413, rollback, validación de duplicados, XOR ubicación). **132 pasando**.

---

## Inventario — Ola 4: Arriendo + facturación (EN PAUSA)

Esperar confirmación jefatura. El schema de Ola 1 ya dejó los hooks necesarios (`tipo_flujo`, `propietario`, `es_consumible`). No requiere re-migrar.

Cuando se desbloquee:
- Tabla `arriendos_activos(item_id, origen_bodega_id, destino_obra_id, fecha_apertura, fecha_cierre_esperada, fecha_cierre_real, cantidad, tarifa_snapshot)`
- Trigger conceptual: transferencia bodega Dedalius → obra LOLS, ítem no consumible → abre arriendo
- Devolución/rechazo cierra arriendo y calcula costo `(dias × tarifa)`
- Reporte mensual + export Excel

---

## Inventario — Ola 5: Calidad (backlog)

- Endpoint recepción compras externas (hoy solo script offline `import_inventario.js`)
- Reporte auditoría física (diferencia sistema vs bodega real) + ajuste con motivo
- Dashboard Dedalius: KPIs ocupación bodega, ítems más arrendados, nunca movidos
- Renombres cosméticos si quedan referencias a "Dali" (debe decir "Dedalius")

---

## Decisiones de diseño registradas

| Decisión | Razonamiento |
|----------|-------------|
| `propietario` ENUM no FK | Minimalista. Dedalius solo arrienda a LOLS ahora. Si mañana hay terceros, migrar a FK. |
| Stock decrece al despachar | Evita "stock fantasma" de aprobaciones que nunca salen físicamente |
| Bodegas = entradas libres | No hay bodegas hardcoded; usuario crea/desactiva vía UI |
| Consumibles no devuelven | UI deshabilita devolución si `es_consumible=TRUE` |
| Ola 4 en pausa | Arriendo requiere confirmación jefatura antes de diseñar |

---

## Deuda técnica conocida

- **Colisión `032_`**: existen `032_cleanup_es_sabado.sql` y `032_transferencia_parcial.sql`. El runner de migraciones usa filename; si ambas están marcadas como aplicadas, no hay problema práctico. Pero es confuso. Renombrar uno si se abre una oportunidad limpia.
- Rows `Cerrillos`, `Paraguay`, `Rivas Vicuña` sembrados en staging por migración 034 original. Quedan en DB (drop rompería FKs si tienen stock). Desactivar vía UI si no se usan.

---

## Archivos clave del proyecto

### Backend inventario
| Archivo | Propósito |
|---------|-----------|
| `backend/src/services/transferencia.service.js` | Lógica transferencias (refactor ola 2) |
| `backend/src/routes/transferencias.routes.js` | Endpoints REST transferencias |
| `backend/src/services/itemInventario.service.js` | CRUD ítems + bulk (ola 3) |
| `backend/db/migrations/033_inventario_foundations.sql` | Schema ola 1 |
| `backend/db/migrations/035_revert_bodega_flags.sql` | Reversa flags bodegas |

### Frontend inventario
| Archivo | Propósito |
|---------|-----------|
| `frontend/src/types/entities.ts` | Tipos TS: ItemInventario, Bodega, Transferencia, etc. |
| `frontend/src/components/inventario/TransferenciasPanel.tsx` | Panel principal (ola 2) |
| `frontend/src/components/inventario/TransferenciaDetail.tsx` | Detalle + acciones condicionales (ola 2) |
| `frontend/src/pages/InventarioMaestro.tsx` | Bulk edit grid (ola 3, crear) |

### Infra
| Archivo | Propósito |
|---------|-----------|
| `docs/RUNBOOK.md` | Guía completa de operaciones |
| `backend/scripts/migrate.js` | Runner de migraciones |
| `.github/workflows/deploy-cpanel-staging.yml` | Deploy automático a staging |

---

## Cómo retomar

```bash
git clone https://github.com/Mauricio-Alvarez-T/Boveda-LOLS.git
cd Boveda-LOLS
git checkout develop
git pull origin develop

cd backend && npm install
cd ../frontend && npm install

# Verificar (debe dar 104/104)
cd ../backend && npm test

# Typecheck
cd ../frontend && npx tsc --noEmit

# Dev
cd ../backend && npm run dev
cd ../frontend && npm run dev
```

Próxima tarea: **Ola 5** (calidad / backlog) o desbloqueo de **Ola 4** (arriendo, esperando jefatura). Olas 1, 2 y 3 completas.
