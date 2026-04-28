# Roadmap — Auditoría Completa del Módulo Inventario

> **Estado actual:** Sprints 1 y 2 completados. Sprint 3 en preparación.
> **Rama de trabajo:** `develop`
> **Plan original:** `C:\Users\maatr\.claude\plans\regalon-necesito-contruir-una-sorted-diffie.md` (aprobado en sesión)

---

## 📊 Contexto

Auditoría exhaustiva del módulo Inventario que identificó:

| Severidad | Cantidad | Categoría |
|---|---|---|
| 🔴 CRITICAL | 7 | Race conditions, audit trail, hooks mal usados, bugs de side effects |
| 🟠 HIGH | 9 | N+1 queries, validaciones débiles, memoización faltante, permisos |
| 🟡 MEDIUM | 6 | Índices DB, paginación, snapshot robustez, cache global |
| 🔵 LOW | 6+ | aria-labels, magic numbers, formato fechas inconsistente |

### Decisiones del usuario (Phase 3 del plan)
1. **Alcance:** atacar todos los niveles (CRITICAL → LOW).
2. **Concurrencia:** lock pesimista con `SELECT ... FOR UPDATE` (estándar MySQL).
3. **Audit trail:** columnas dedicadas en `transferencias` (`creado_por`, `aprobado_por`, `despachado_por`, `recibido_por`, `rechazado_por`, `cancelado_por`) + setear en cada transición de estado.
4. **Tests:** crear nuevos tests para cada fix CRITICAL.

---

## ✅ Sprint 1 — Backend CRITICAL (commit `4ab2342`)

**Foco:** race conditions, audit trail, robustez del cálculo de delta mensual.

### 1.1 Migración 039 — `audit_trail_e_indices_inventario.sql` ✅
- Agrega 6 columnas audit a `transferencias`: `creado_por`, `aprobado_por`, `despachado_por`, `recibido_por`, `rechazado_por`, `cancelado_por`. Todas como `INT NULL` con FK a `usuarios(id)`.
- Backfill `creado_por = solicitante_id` para registros previos a la migración.
- Índices nuevos: `idx_trf_estado_activo` en `transferencias(estado, activo)`, `idx_us_obra_bodega` en `ubicaciones_stock(obra_id, bodega_id)`, `idx_disc_estado` en `transferencia_discrepancias(estado)`.
- Patrón idempotente con `information_schema + PREPARE/EXECUTE` (heredado de migración 037).
- Tipos `INT` signed para evitar `errno 150` (aprendizaje de migración 038).

### 1.2 Race conditions con SELECT FOR UPDATE ✅
**Archivo:** `backend/src/services/transferencia.service.js`

Todos los SELECT iniciales de los métodos de transición de estado ahora usan `FOR UPDATE`, lo que coloca un lock pesimista por fila durante la transacción:
- `aprobar(id, ...)` — bloquea contra doble aprobación simultánea.
- `despachar(id, ...)` — bloquea contra doble despacho.
- `recibir(id, ...)` — bloquea durante decremento de stock al destino.
- `rechazar(id, ...)` — vía `_selectForStatusChange` con SQL template actualizado.
- `cancelar(id, ...)` — idem.

### 1.3 Audit columns en cada transición ✅
- `aprobar` → `aprobado_por = aprobadorId`.
- `despachar` → `despachado_por = transportistaId`.
- `recibir` → `recibido_por = receptorId`.
- `rechazar` → `rechazado_por = aprobadorId`.
- `cancelar` → `cancelado_por = userId`.
- 5 INSERTs en flujos creadores (`crear`, `crearFaltante`, `pushDirecto`, `intraBodega`, `ordenGerencia`) ahora setean `creado_por` (y los demás audit cuando aplica, ej: `intraBodega` setea los 4 porque crea la transferencia ya `recibida`).

### 1.4 Fix delta mensual robusto ✅
**Archivo:** `backend/src/services/inventario.service.js` método `getDashboardEjecutivo`.

**Antes:** `mes_anterior = series[0].valor` cuando `series.length >= 20`. Frágil ante días faltantes en el cron — el primer punto podía ser de hace 25 días en vez de 30.

**Ahora:** helper `findMesAnterior(series)` busca el snapshot exacto a 30 días. Si no existe punto exacto, toma el más cercano dentro de ventana ±3 días. Si no hay ningún punto válido, retorna `null`.

**Guard contra división por cero:**
- `mes_anterior === null` → `delta_pct = null` (sin comparable).
- `mes_anterior === 0 && hoy === 0` → `delta_pct = 0` (sin cambio real).
- `mes_anterior === 0 && hoy > 0` → `delta_pct = null` (subió desde 0, no hay base de comparación).
- `mes_anterior > 0` → `Math.round((hoy - mes_anterior) / mes_anterior * 100)`.

### 1.5 Tests ✅
**Archivo nuevo:** `backend/tests/transferencia_concurrencia.test.js` (10 tests)
- Inspecciona el código fuente del service para verificar que cada método contiene `FOR UPDATE` en su SELECT inicial.
- Verifica que cada UPDATE incluye la columna audit correspondiente.
- Verifica que los 4 INSERTs de flujos directos incluyen `creado_por` (y los demás audit cuando aplica).

**Archivo nuevo:** `backend/tests/inventario_dashboard_edges.test.js` (5 tests)
- `delta_pct = null` cuando no hay snapshots.
- `delta_pct = 0` cuando hoy = 0 y mes_anterior = 0.
- `delta_pct = null` cuando subió desde 0 (no comparable).
- `delta_pct = 20` cuando hoy = 12 y mes_anterior = 10 (cálculo correcto).
- `mes_anterior = null` si snapshot fuera de ventana ±3 días.

**Total tests pasando:** `163 / 163` (era `144 / 144`).

### 1.6 Pendiente para staging
- [ ] Correr `npm run migrate` en cPanel staging después del próximo deploy.
- [ ] Smoke test: aprobar transferencia → verificar `aprobado_por` populado en DB.
- [ ] Smoke test: dashboard sin snapshot mes anterior → verificar `delta_pct = null` no rompe la UI.

---

## ✅ Sprint 2 — Frontend CRITICAL+HIGH (commits `ba85994` y `db41c89`)

**Foco:** bugs de hooks, tipado, accesibilidad, memoización.

### 2.1 useEffect en lugar de useMemo para reset de forms ✅
**Archivo:** `frontend/src/components/inventario/TransferenciaDetail.tsx` línea 222.

**Antes:** `useMemo(() => { setActiveForm(...); ... }, [t.id])`. React puede skipear `useMemo` en re-renders idénticos sin garantía de ejecutar el side effect.

**Ahora:** `useEffect` con dependencia `[t.id]`. Garantiza ejecución cuando cambia la transferencia seleccionada.

### 2.2 Tipado correcto sin `as any` ✅
**Archivo:** `frontend/src/types/entities.ts` interface `Transferencia`.

Agregué los siguientes campos opcionales que el backend ya envía vía JOINs en `getById()` y `getAll()`:
- `origen_obra_nombre`, `origen_bodega_nombre`, `destino_obra_nombre`, `destino_bodega_nombre`
- `aprobador_nombre`, `receptor_nombre`, `transportista_nombre`
- `observaciones_rechazo`
- Audit columns nuevas: `creado_por`, `aprobado_por`, `despachado_por`, `recibido_por`, `rechazado_por`, `cancelado_por`

**Eliminé los `(t as any).campo`** en `TransferenciaDetail.tsx` — ahora usa los tipos directamente. Si el backend cambia un nombre de campo, TypeScript avisa de inmediato.

### 2.3 Modal con cierre por tecla Escape ✅
**Archivo:** `frontend/src/components/ui/Modal.tsx`.

Agregué `useEffect` que registra listener `keydown` cuando `isOpen=true`. Si la tecla es `Escape`, llama a `handleClose()` (respeta el confirm de cambios sin guardar). Listener se desregistra al cerrar el modal.

### 2.4 Memoización de subcomponentes en ResumenEjecutivoPanel ✅
**Archivo:** `frontend/src/components/inventario/ResumenEjecutivoPanel.tsx`.

Envolví con `React.memo`:
- `Sparkline` (mini gráfico SVG de 7 puntos por KPI)
- `ComparativaChip` (chip ↑/↓ con porcentaje vs mes anterior)
- `KpiCard` (card grande con valor + sparkline + chip)
- `ObraRankingItem` (fila del ranking de obras por valor)
- `AlertaItem` (item del card "Requiere tu atención")

**Patrón usado:** definir `XxxImpl` con la lógica y exportar `Xxx = React.memo(XxxImpl)`. Mantiene compatibilidad con todos los usos previos en el panel.

**Impacto esperado:** typear en una input antes solo causaba re-render del panel padre, ahora también skipea los 5+ KPI cards y filas si sus props no cambiaron.

### 2.5 ResumenMensualTable con `React.memo` + `useCallback` 🔄 DIFERIDO
**Archivo:** `frontend/src/components/inventario/ResumenMensualTable.tsx` (677 líneas).

**Estado:** documentado como pendiente. La tabla mensual tiene una estructura compleja (filas editables con handlers inline en cada cell). Refactorizarla requiere mover `renderEditableQty()` y handlers a `useCallback` con deps correctas + memoizar las filas individualmente.

**Razón del diferimiento:** Sprint 2 ya entregó la mejora de memoización más impactante (ResumenEjecutivoPanel se ve en cada login). La tabla mensual se usa con menor frecuencia y el costo del refactor es alto. Se atacará en Sprint 3 junto con el N+1 fix del backend.

### 2.6 Manejo 403 en acciones 🔄 PARCIAL
**Archivo:** `frontend/src/hooks/inventario/useTransferencias.ts` y `TransferenciasPanel.tsx`.

**Estado actual:** los catches del hook ya muestran `err.response?.data?.error` con toast. Cuando el backend devuelve 403, el toast muestra el mensaje del backend (ej: "Sin permisos para esta acción").

**Mejora pendiente (Sprint 4):** centralizar el manejo en un interceptor de Axios para garantizar el mismo mensaje en todo el módulo, sin depender de que cada catch lo implemente. Se ataca junto con los demás items de UX (toast errors con detalle, console.error).

### 2.7 Clipboard fallback en ItemDetailModal ✅
**Archivo:** `frontend/src/components/inventario/ItemDetailModal.tsx`.

**Antes:** `navigator.clipboard.writeText()` directo, falla silenciosa en contextos no-HTTPS o navegadores antiguos.

**Ahora:**
- Importa `copyToClipboard` de `frontend/src/utils/whatsappShare.ts` (helper con fallback a `document.execCommand('copy')`).
- Convertí el handler a `async` para esperar el resultado.
- Agregué `useEffect` que limpia el `setTimeout` del badge "copied" si el modal se cierra antes de que se reset (memory leak fix).

---

## 🚧 Sprint 3 — HIGH + MEDIUM backend (PENDIENTE)

### 3.1 N+1 fix en `getResumen()`
**Archivo:** `backend/src/services/inventario.service.js` líneas 8-109.

**Problema:** 3 loops anidados (obras × items × ubicaciones) para construir el mapa de stock por obra/categoría. Con 50+ obras y 1000+ items, cargar el resumen tarda segundos.

**Plan:**
- Agregar `WHERE activo = 1` al SELECT de descuentos (línea 48) para reducir filas cargadas.
- Reemplazar los 3 loops por un `Map<obra_id, Map<categoria_id, total>>` construido en una sola pasada.

### 3.2 Validar cantidades >= 0 en stock updates
**Archivo:** `backend/src/services/inventario.service.js` líneas 248-278 + `itemInventarioBulk.service.js`.

Agregar guard `if (cantidad < 0 || cantidad > 999999) throw {statusCode: 400, ...}`. Hoy el UPSERT acepta valores negativos sin error.

### 3.3 Fix permiso resolver discrepancia
**Archivo:** `backend/src/routes/transferencias.routes.js` línea 40.

Cambiar `checkPermission('inventario.editar')` → `checkPermission('inventario.aprobar')`. Resolver una discrepancia es decisión de aprobador, no editor.

### 3.4 `snapshot_dashboard.js` robusto
**Archivo:** `backend/scripts/snapshot_dashboard.js`.

Wrap en try/catch global, agregar timeout por query, `process.exit(1)` en errores. Cron de cPanel detecta exit codes y alerta.

### 3.5 Eliminar cache módulo-wide `_stockReconcilColMissing`
**Archivo:** `backend/src/services/transferencia.service.js` líneas 27-57.

La migración 036 ya está aplicada en staging. El fallback que asume que la columna `stock_reconciliado` puede no existir ya no es necesario. Eliminar el cache + el catch del `ER_BAD_FIELD_ERROR` y simplemente usar `stock_reconciliado` directo.

### 3.6 Paginación en discrepancias
**Archivo:** `backend/src/services/discrepancias.service.js`.

`getAll()` retorna todas las filas sin `total / page / limit`. Agregar parámetros y query `COUNT(*)` para paginar.

### 3.7 Top obras configurable
**Archivo:** `backend/src/services/inventario.service.js` método `getDashboardEjecutivo`.

Hardcoded `slice(0, 5)`. Agregar `topObrasLimit = 5` como opcional param.

### 3.8 Documentar decisión soft-delete `ubicaciones_stock`
**Archivo:** `docs/RUNBOOK.md`.

Agregar sección que explique por qué `ubicaciones_stock` se borra duro (CASCADE) cuando se elimina obra/item, mientras que `items_inventario` y `bodegas` usan soft-delete (`activo`).

### 3.9 ResumenMensualTable memoización (diferido del Sprint 2)
Ver detalles en Sprint 2.5.

---

## 🚧 Sprint 4 — LOW (PENDIENTE)

### 4.1 aria-labels en botones icon-only
- `StockUbicacionTable.tsx` línea 79
- `ItemDetailModal.tsx` línea 91
- Botones en TransferenciaDetail sin labels accesibles

### 4.2 Helper único de formato fechas
**Archivo nuevo:** `frontend/src/utils/fechas.ts`.

Centralizar `fmtFecha(raw)`, `diaDelMes(raw)`, `normalizarFecha(raw)`. Actualmente hay duplicación entre `TransferenciaDetail.tsx` (usa `toLocaleDateString`), `FacturasTab.tsx` (usa `.slice(0,10)`), `sabadosWhatsApp.ts` (tiene helpers propios).

### 4.3 Toast errors con detalle
- Agregar `console.error(err)` en cada catch para debug.
- Pasar `description: err.message` al toast para mostrar el detalle técnico.

### 4.4 Joi schemas en routes principales
**Archivo nuevo:** `backend/src/middleware/validateBody.js`.

Agregar validación con Joi a:
- `POST /api/transferencias`
- `PUT /api/transferencias/:id/aprobar`
- `PUT /api/inventario/stock`
- `PUT /api/inventario/items/bulk`

### 4.5 Virtualización StockUbicacionTable (condicional)
Solo si después de medir > 100 items renderizados causa lag visible. Si la performance actual es aceptable, dejar `// TODO virtualization` y postponer.

### 4.6 Manejo 403 centralizado (interceptor Axios)
**Archivo:** `frontend/src/services/api.ts`.

Interceptor de response que detecta status 403 y muestra toast: "No tienes permiso para esta acción". Reduce duplicación en cada hook.

---

## 📈 Resumen de progreso

| Sprint | Estado | Commits | Items completados |
|---|---|---|---|
| 1 — Backend CRITICAL | ✅ | `4ab2342` | 6/6 (migración, race conditions, audit columns, delta robusto, 15 tests nuevos) |
| 2 — Frontend CRITICAL+HIGH | ✅ | `ba85994`, `db41c89` | 5/7 (2 diferidos a Sprint 3 y 4) |
| 3 — HIGH+MEDIUM | ⏳ | — | 0/9 |
| 4 — LOW | ⏳ | — | 0/6 |

### Tests totales del proyecto
- **Antes:** `144 / 144`
- **Después de Sprint 1:** `163 / 163` (+19 tests nuevos en concurrencia y delta edges)

---

## 🔧 Acciones pendientes en staging

Una vez el deploy automático suba los cambios a `test.boveda.lols.cl`:

1. **Correr migración 039:**
   - cPanel → Setup Node.js App → Run JS script → `migrate`
   - Verifica que aparece "✅ 039_audit_trail_e_indices_inventario.sql aplicada".
2. **Smoke tests manuales:**
   - Aprobar una transferencia → verificar en DB que `aprobado_por` quedó populado con el ID del usuario.
   - Recibir una transferencia → verificar `recibido_por`.
   - Cancelar una transferencia → verificar `cancelado_por`.
   - Abrir el dashboard ejecutivo → verificar que el chip de "Variación" se ve correcto (sin "Infinity%" ni NaN).
   - Probar Escape en modales (cualquier modal del módulo) → debe cerrar.
   - Copiar Nº de item desde `ItemDetailModal` en una pestaña no-HTTPS → verificar que funciona via fallback.

---

## 📌 Notas

- La migración 039 es **idempotente**. Re-correrla en producción es seguro.
- Las columnas audit son `NULL` para registros previos. Solo el `creado_por` se backfilló desde `solicitante_id`. Las demás (aprobado_por, etc.) quedarán NULL para transferencias antiguas hasta que pasen por una nueva transición.
- El plan completo aprobado vive en `C:\Users\maatr\.claude\plans\regalon-necesito-contruir-una-sorted-diffie.md` (ruta de Claude Code).

---

> **Próximo paso recomendado:** arrancar Sprint 3 con el fix permiso resolver discrepancia (es 1 línea, alto impacto de seguridad), seguido del N+1 en `getResumen()` (mayor ganancia de rendimiento).
