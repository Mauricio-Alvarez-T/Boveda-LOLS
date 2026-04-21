# Handoff: Estado actual — Bóveda LOLS

> **Documento de continuidad.** Actualizado al 2026-04-21. Retomar desde cualquier máquina.

---

## Estado general del proyecto

| Módulo | Estado |
|--------|--------|
| Asistencia (todas las olas) | ✅ Completado y en producción |
| Inventario — Ola 1: Foundations | ✅ Mergeado a `develop` |
| Inventario — Ola 2: Matriz 8 flujos | 🔲 Siguiente PR |
| Inventario — Ola 3: Bulk edit | 🔲 Pendiente |
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

## Inventario — Ola 2: Matriz 8 flujos (SIGUIENTE PR)

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

### Regla crítica de stock
**Stock decrece al despacho físico** (estado → `en_tránsito`), **NO al aprobar**.
Stock destino sube al recibir. Evita "stock fantasma" de aprobaciones que nunca salen.

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

## Inventario — Ola 3: Bulk edit (pendiente, paralelizable)

### Backend
- `PUT /api/items-inventario/bulk` — edición masiva de ítems (MAX_ITEMS=500, 413, rollback, log diff)
- `PUT /api/inventario/stock/bulk` — ajuste masivo de existencias (mismo cap)

### Frontend
- Nueva página `frontend/src/pages/InventarioMaestro.tsx` (ruta `/inventario/maestro`)
- Grid editable tipo Excel: columnas nro_item, descripción, categoría, unidad, valor_compra, valor_arriendo, es_consumible, propietario, activo
- Filtros + selección múltiple + acciones batch
- Edición inline con debounce; Ctrl+S para commit manual

Tests: 3 (happy bulk, cap 413, rollback).

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

Próxima tarea: **Ola 2 — matriz 8 flujos**. Crear rama `feat/inventario-flujos` desde develop.
