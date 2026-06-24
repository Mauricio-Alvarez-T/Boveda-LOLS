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
| solicitud_materiales | solo items custom | ✓ | ✓ | transferencias.solicitud_materiales |
| push_directo | bodega→obra | ✗ (consolida roles) | exento | transferencias.push_directo |
| intra_bodega | bodega→bodega | instantáneo | exento | transferencias.intra_bodega |
| intra_obra | obra→obra | ✓ | ✓ | transferencias.intra_obra |
| orden_gerencia | bodega→obra | bypass | exento | transferencias.orden_gerencia |
| devolucion | obra→bodega | ✓ | ✓ | transferencias.devolucion |

> **Auditoría de permisos (2026-06):** `devolucion` e `intra_obra` pasaron a tener **permiso propio**
> (antes heredaban `solicitar`; migración 080 hace backfill a los roles que ya tenían `solicitar`,
> sin regresión). Se eliminó la genérica obsoleta `inventario.aprobar` (reemplazada por
> `transferencias.aprobar`). La pestaña **"Movimientos"** (kardex) se gatea con
> `inventario.movimientos.ver`, ahora registrada en catálogo + jerarquía (antes sólo existía en la
> DB vía migración 054, por lo que caía en "Configuración → Otros" del panel de roles).

- `solicitud_materiales` = SOLO items personalizados (`transferencia_items_custom`), sin catálogo.
  El aprobador puede ajustar cantidad, quitar/incluir, corregir descripción, agregar ítems y dejar
  nota (mig 070), y decide la **fuente por ítem: comprar | traer de otra obra** (mig 071,
  `fuente` + `origen_obra_id`; "traer de obra" es solo indicación, no mueve stock).
- El chip de fuente (Comprar/Traer de obra) solo se muestra cuando `estado != 'pendiente'`
  (la fuente es decisión del aprobador).

## Regla de oro: el stock se saca primero de BODEGAS

- El **solicitante** (modo "pedir") ve y pide contra el stock de **bodegas** (suma de todas las
  bodegas; las obras NO se le muestran). Nunca elige origen — eso lo decide el aprobador.
- **Sobre-pedido permitido**: puede crear la solicitud aunque supere el stock en bodega. El wizard
  avisa por ítem _"en bodega hay X, el aprobador revisará el resto"_; `crear()` **NO valida stock**
  para la solicitud (sí lo valida para `devolucion`/`intra_obra`/`intra_bodega`, que mueven desde un
  origen físico fijo). Ref: `transferencia.service.js` crear(); `wizardEngine.ts` `disponibleTotal`
  (solo bodegas); `CatalogoCarrito.tsx` (aviso ámbar no-bloqueante).
- El **aprobador** es el ÚNICO que completa el faltante desde una **obra**. Ve bodegas + obras y arma
  el origen con splits multi-origen; el auto-armado (`AprobarForm.autoCompletar`) **agota bodegas
  primero** y usa obras solo para el remanente. Las ubicaciones de obra se distinguen visualmente
  (verde + pin) de las de bodega (ámbar + ícono bodega).

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

## Respaldo por WhatsApp (`utils/transferenciaWhatsApp.ts`)

`buildTransferenciaWhatsappText()` arma un mensaje de respaldo/notificación (función PURA; el envío lo
hace `utils/whatsappShare.ts` → copia + toast "ENVIAR AHORA"; **no cambia estado**). Disponible en **todo**
el ciclo, incl. estados terminales (`canCompartirWhatsApp` en `useTransferenciaDetail`).

**Formato compacto (2026-06)**: encabezado `🚛 *{codigo}* · {estado}` + ruta `📍 {origen} → {destino}` + fecha,
cada uno en 1 línea; grupos de ítems SIN líneas en blanco intermedias; línea de ítem `• {cant} {U} · {desc}`
(separador `·`); pie en 1 línea `👤 Solic: … · ✅ Aprob: …` + `_Bóveda LOLS_`. Ruta/destino se derivan con
`transferenciaRoute()` de `utils/formatBodega.ts` (única fuente, compartida con el chip de detalle y el modal).

**Dos puntos de envío** (decisión 2026-06, "mantener ambos"):
1. **Ícono siempre-visible** en `TransferenciaActionsMenu` → reenvío en cualquier estado.
2. **Modal-resumen `ResumenAccionModal`** (`components/inventario/transferencia-detail/`): se abre AUTOMÁTICAMENTE
   tras las 4 acciones clave — **crear solicitud · aprobar · recibir total · recepción parcial** (disparado en
   `TransferenciasPanel` tras el refetch, con la TRF fresca de `trfHook.selected`). Muestra qué pasó + el
   **preview EXACTO** del mensaje + el botón de WhatsApp, para que quede claro CUÁNDO se envía. Los movimientos
   directos (`mover`: push/intra/devolución) y los terminales NO abren el modal (los cubre el ícono).

**Cantidad por estado — regla null-aware: un `0` explícito SE MUESTRA (NO usar `||`, que esconde el 0):**

| Estado | Ítem catálogo | Ítem custom |
|---|---|---|
| pendiente | `cantidad_solicitada` | `cantidad` (pedida) |
| aprobada / en_transito | `cantidad_enviada ?? solicitada` | `cantidad_aprobada ?? cantidad` |
| recepcion_parcial | enviada + línea "Recibidas/Faltan" | aprobada + "Recibidas/Faltan" |
| recibida | `cantidad_recibida ?? enviada ?? solicitada` + discrepancia si difiere de enviada | `cantidad_recibida ?? aprobada` + discrepancia si difiere de aprobada |
| rechazada / cancelada | última conocida (`enviada ?? solicitada`) | `aprobada ?? cantidad` |

- **Por qué el null-aware:** un faltante total al recibir (`recibida=0`) o un ítem que el aprobador
  cortó a 0 (`enviada=0`) DEBEN verse como `0` — antes el `||` mostraba la cantidad anterior y escondía
  el cambio (bug 2026-06).
- **Ítems custom**: se omiten los `aprobado=false` (quitados por el aprobador); sección separada
  "Comprar" vs "De otra obra" (`fuente`/`origen_obra_id`); nota del aprobador si existe.
- **Estados terminales**: `rechazada` muestra **motivo** (`observaciones_rechazo`) + **quién**
  (`rechazado_por_nombre`); `cancelada` muestra **quién** (`cancelado_por_nombre`). Ambos `_nombre` los
  expone `getById` vía JOIN. (Hoy la cancelación NO tiene campo de motivo.)
- **Datos frescos**: el detalle recibe `t/items/itemsCustom` como props, refrescadas tras cada acción.
- **Efímero**: el respaldo NO se persiste (no hay log de envío). El audit trail real vive en
  `transferencias` (`creado/aprobado/recibido/rechazado/cancelado_por`), `transferencia_recepciones` y
  `transferencia_discrepancias`.
- **Anti-regresión**: `frontend/src/utils/transferenciaWhatsApp.test.ts` fija el contenido por estado ×
  tipo de ítem × cambio (recibido 0, ítem cortado a 0, custom recibido, discrepancias, rechazo/cancelación).

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
- **OJO**: desde Fase 1 (typeCast) los flags BOOLEAN llegan como **boolean real**. Frontend usa
  `flagOn()`/`flagOff()` de `utils/flags.ts` (dual-aware: aceptan 0/1 y true/false); nunca comparar
  `=== 1`/`=== false` a pelo. Query params de filtro: `=1`, nunca `=true`.
