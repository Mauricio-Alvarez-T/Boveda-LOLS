# Reglas — Inventario y Transferencias

## State machine de transferencias (`transferencias.estado`)

```
pendiente → aprobada → en_transito → recepcion_parcial → recibida
     ↘ rechazada                ↘ rechazada (recepción)
     ↘ cancelada (soft-delete activo=0)
```
Implementación: `backend/src/services/transferencia.service.js`.

- **pendiente**: creada, espera aprobación.
- **aprobada**: espera despacho.
- **en_transito**: despachada. Régimen nuevo: stock aún no se mueve.
- **recepcion_parcial**: llegó parte; espera más viajes (mig 048).
- **recibida**: cierre. Origen decrementa + destino incrementa (régimen nuevo). Diferencias → discrepancia.
- **rechazada**: por aprobador (desde pendiente) o receptor (desde en_transito). Stock no se mueve.
- **cancelada**: soft-delete (`activo=0`).

## Tipos de flujo (`tipo_flujo`)

| Flujo | Ruta | Aprobación | SoD | Permiso |
|---|---|---|---|---|
| solicitud | obra↔bodega | ✓ | ✓ | transferencias.solicitar |
| solicitud_materiales | solo items custom | ✓ | ✓ | transferencias.solicitar |
| push_directo | bodega→obra | ✗ (consolida roles) | exento | transferencias.push_directo |
| intra_bodega | bodega→bodega | instantáneo | exento | transferencias.intra_bodega |
| intra_obra | obra→obra | ✓ | ✓ | (solicitar) |
| orden_gerencia | bodega→obra | bypass | exento | transferencias.orden_gerencia |
| devolucion | obra→bodega | ✓ | ✓ | (solicitar) |

- `solicitud_materiales` = SOLO items personalizados (`transferencia_items_custom`), sin catálogo.
  El aprobador puede ajustar cantidad, quitar/incluir, corregir descripción, agregar ítems y dejar
  nota (mig 070), y decide la **fuente por ítem: comprar | traer de otra obra** (mig 071,
  `fuente` + `origen_obra_id`; "traer de obra" es solo indicación, no mueve stock).
- El chip de fuente (Comprar/Traer de obra) solo se muestra cuando `estado != 'pendiente'`
  (la fuente es decisión del aprobador).

## Segregación de funciones (SoD)

- Regla: **solicitante ≠ aprobador ≠ transportista ≠ receptor** (flujos normales).
- Backend devuelve 403 si un usuario intenta dos roles consecutivos; UI oculta el botón
  (defensa en profundidad). `transferencia.service.js`.
- **`inventario.transferencias.sod_bypass`** permite consolidar roles (obras unipersonales,
  emergencias); queda en audit log.
- Flujos push_directo / intra_bodega / orden_gerencia consolidan roles a propósito → SoD no aplica,
  solo gate de permiso.

## Stock y régimen (`stock_reconciliado`, mig 036)

- **Nuevo (TRUE)**: stock se mueve SOLO al `recibir()`.
- **Legacy (FALSE)**: stock se decrementó al aprobar (transferencias antiguas).
- Multi-origen: `transferencia_item_origenes` (mig 029) — splits FIFO por ítem; el aprobador asigna
  desde qué ubicaciones sale cada cantidad ("Auto-completar" greedy disponible).
- `ubicaciones_stock`: UNIQUE NULL-safe `(item_id, obra_id, bodega_id)` con XOR obra/bodega
  (mig 050); `cantidad DECIMAL(12,4)` admite fraccionales (mig 052). Hard-delete (estado vivo).
- `stock_movimientos` (mig 054): audit trail de cada cambio.

## Recepción parcial (mig 048)

- Parcial → estado `recepcion_parcial`, se esperan más viajes; historial por evento en
  `transferencia_recepciones` (+items).
- Total → cierra (`recibida`); faltante = **merma** (genera discrepancia); requiere confirmación
  (checkbox "entrega final" / modal de merma).
- Over-receive en parcial bloqueado (400); sobrantes solo vía recepción total.
- SoD por evento de recepción (receptor ≠ transportista).
- En `solicitud_materiales` la recepción es simple: confirmar con observación de sobrantes
  (`MaterialesRecepcionPanel`), cierra con tipo 'total'.

## Discrepancias

- Auto-creadas al recibir si `cantidad_recibida ≠ cantidad_enviada`. Vista propia (chip
  Discrepancias en Transferencias); resolución `resuelta | descartada` con texto.
- Hard-delete por CASCADE con la transferencia.

## Faltantes

- Al aprobar con stock insuficiente: modal de decisión → opción de crear una TRF nueva por el
  faltante (`onCrearFaltante`).

## Descuentos y facturación (gateados — ver seguridad-rbac.md)

- **Descuento por obra**: porcentaje configurable (permiso `inventario.descuentos.gestionar`);
  aplica al total facturación → `total_con_descuento`.
- **Arriendo**: `items_inventario.valor_arriendo` (+ `valor_arriendo_override` por ubicación),
  `m2` para superficie. Total facturación visible solo con `inventario.costos.ver`.
- **Facturas** (`facturas_inventario` + items): montos gateados por `inventario.facturas.ver`;
  gestión por `inventario.facturas.gestionar`. Anular = cesto de basura (Trash2).
- Backend **sanitiza** el JSON (campos $ no llegan) si el usuario no tiene permiso —
  `backend/src/utils/sanitizeFinancialFields.js`.

## Items y bodegas

- `items_inventario`: soft-delete (`activo=0`) — preserva historial; imagen vía `/api/uploads/...`.
- Bodegas: soft-delete (`activa=0`); `responsable_nombre` texto libre (mig 060).
- Items dentro de cada categoría se listan en orden alfabético (descripción ASC).

## Participación (mig 075 — ver obras-bodegas.md)

- Obras con `participa_transferencias=0` y bodegas con `participa_transferencias=0` no aparecen
  como origen/destino en formularios de movimiento (filtro `?participa_transferencias=1`).
- Bodegas con `participa_inventario=0` no aparecen en resumen/stock (filtro SQL en
  `inventario.service.js`).
- **OJO**: los flags BOOLEAN llegan del API como **0/1** (mysql2 sin typeCast — se corrige en Fase 1
  del plan v2). Frontend usa `flagOff()` de `utils/flags.ts`; nunca `=== false`. Query params: `=1`,
  nunca `=true`.
