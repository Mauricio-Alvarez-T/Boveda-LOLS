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
- **recibida**: cierre. Origen decrementa lo RECIBIDO + destino incrementa lo recibido (régimen nuevo,
  por evento). Diferencias → discrepancia, que se resuelve eligiendo la causa (§ Discrepancias).
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
- Total → cierra (`recibida`); lo recibido acumulado ≠ enviado genera discrepancia (faltante o
  sobrante); requiere confirmación (checkbox "entrega final" / modal de merma). El stock de la
  diferencia NO se corrige al recibir: se corrige al resolverla con su causa (§ Discrepancias).
- Over-receive en parcial bloqueado (400); sobrantes solo vía recepción total.
- SoD por evento de recepción (receptor ≠ transportista).
- En `solicitud_materiales` la recepción es simple: confirmar con observación de sobrantes
  (`MaterialesRecepcionPanel`), cierra con tipo 'total'.

## Bodeguero — scoping por bodega destino (mig 097)

- `usuarios.bodega_id` (NULL = sin bodega, comportamiento clásico). Se asigna en el form de
  usuario (Configuración → Usuarios → "Bodega Asignada"); vive en el JWT → **re-login tras
  asignar/cambiar** (el PUT bumpea la versión del rol para forzarlo).
- **Visibilidad**: sin `ver_todas`, un usuario con bodega ve sus propias solicitudes **+ las
  transferencias DESTINADAS a su bodega** (`getAll`: `solicitante_id = ? OR destino_bodega_id = ?`;
  `GET /:id` también lo permite).
- **Enforcement**: usuario con bodega solo puede `recibir` / `rechazar-recepcion` transferencias
  destinadas a SU bodega (403 si ajena; backend + gating de botón en `useTransferenciaDetail`).
  Usuarios sin bodega: sin cambio. El SoD existente se mantiene.
- Rol típico "Bodeguero" (creado por UI): `inventario.ver` + `inventario.tab.transferencias` +
  `inventario.tab.por_ubicacion` + `inventario.transferencias.recibir`. SIN ver_todas / solicitar /
  aprobar. El flujo de entrada del material a bodega es **devolución** (obra→bodega).

## Histórico general (chip "Histórico" en Inventario → Solicitudes)

- Tabla paginada server-side (`TransferenciasHistorico.tsx`, 50/página) sobre el mismo
  `GET /transferencias`. **Sin permiso nuevo**: quien ve el tab lo ve; el scoping backend
  se mantiene (sin `ver_todas` → propias + destinadas a su bodega).
- Params de `getAll` para el histórico: `q` (LIKE por `codigo`, parametrizado) e
  `incluir_finalizadas=true` (levanta SOLO la exclusión de obras `finalizada=1`; la de
  `es_prueba=1` es innegociable y no se levanta nunca). La lista master NO manda el flag
  → sigue ocultando finalizadas por política.
- Contexto: la lista master solo trae la primera página (default `limit=20` de
  `normalizePagination`); su footer "Mostrando X de N" enlaza al histórico.
- Filtros del histórico: estado (los 7), fecha desde/hasta, solicitante (solo `ver_todas`),
  código con debounce 300ms. Click en fila → vuelve al master-detail con la TRF abierta.

## Tarjeta «Inventario» del Inicio (`GET /api/transferencias/inicio`, 2026-10-20)

`transferenciaService.resumenInicio(user)` cuenta lo que le toca a quien mira, según su perfil; lo que
el perfil no puede hacer viene `null` y la tarjeta no lo muestra. Cada grupo trae `{ total, dias }`
(antigüedad de la más vieja). Excluye obras de prueba y finalizadas, como el resto del módulo.
- `por_aprobar` y `discrepancias` (`transferencias.aprobar`): globales, igual que `GET /pendientes` y la
  pestaña «Diferencias» (transferencias con diferencias `pendiente` y `diferencia <> 0`).
- `por_despachar` (`despachar`, estado `aprobada`) y `por_recibir` (`recibir`, `en_transito` o
  `recepcion_parcial`): con el alcance del listado — sin `ver_todas`, las propias + las destinadas a su
  bodega (mig 097).
- `mis_solicitudes`: las propias en curso (pendiente, aprobada, en tránsito).
La ruta va ANTES de `/:id`. Cada fila abre Inventario → Solicitudes con su filtro:
`/inventario?tab=transferencias&estado=pendiente|aprobada|discrepancias|todas` (Inventario lee `tab` y
`estado` solo al entrar). Lógica del frontend en `resumenInventarioInicio.ts` (con test).

## Discrepancias

- Auto-creadas al recibir (recepción `total`) si lo recibido acumulado ≠ `cantidad_enviada`. Vista
  propia (chip Discrepancias en Transferencias). Hard-delete por CASCADE con la transferencia.
- Qué hizo `recibir()` con el stock (régimen nuevo): **origen −= lo RECIBIDO** (FIFO por split vía
  `transferencia_item_origenes.cantidad_decrementada`; lo recibido por sobre lo enviado sale del
  **origen primario** — `transferencia_items.origen_*` ?? cabecera — con `GREATEST(…, 0)`, o sea si el
  origen no alcanzaba quedó en 0 y ese stock "se creó") y **destino += lo recibido**. Ese exceso
  descontado NO queda en `cantidad_decrementada`, solo en el kardex (`transferencia_salida`).
- **Signo**: `diferencia` en la BD es `enviada − recibida` (positivo = faltante; la UI la lee así). La
  resolución usa `dif = recibida − enviada`: **sobrante** si > 0, **faltante** si < 0.

### Resolver eligiendo la CAUSA (decisión del dueño 2026-10-21, mig 129)

`PUT /api/transferencias/discrepancias/:id/resolver` `{ estado: 'resuelta'|'descartada', resolucion
(nota obligatoria), causa? }` → `{ id, estado, resolucion, causa, ajustes: [{ obra_id, bodega_id,
ubicacion_nombre, cantidad }], aviso }`. Implementación: `transferenciaService.resolverDiscrepancia`;
catálogo cerrado en `backend/src/config/causasDiscrepancia.js` (el schema `validateBody` usa la misma
lista).

- **Descartar** no mueve stock; la causa se ignora (queda `null`).
- **Resolver** exige la causa (400 si falta) y debe calzar con el signo (400 `CAUSA_NO_CALZA` si no):

| Diferencia | Causa | Stock |
|---|---|---|
| Sobrante | `origen_envio_de_mas` | Sin cambio. **Aviso** si hubo unidades SIN RESPALDO: `recibida − Σ(anterior − nueva)` de los `transferencia_salida` de la TRF/ítem en el kardex (lo que el origen no tenía y quedó en 0). |
| Sobrante | `error_conteo_recepcion` | Destino −dif; origen primario + lo que `recibir()` le descontó por sobre lo enviado (`Σ salida − enviada`, tope dif). Si el destino hoy tiene menos que dif → **409** `DESTINO_SIN_STOCK` ("ajusta a mano o elige otra causa") sin tocar nada. |
| Faltante | `perdida_en_transito` | Origen −faltante: primero los saldos no descontados de los splits (FIFO, sube `cantidad_decrementada`), y sin splits —o si no alcanzan— el origen primario. **No baja de 0**: lo que no se pudo descontar va en el aviso. |
| Faltante | `nunca_salio` | Sin cambio (el origen solo descontó lo recibido). |
| Faltante | `llego_despues` | Como pérdida en el origen + destino +faltante (fila nueva copia el `valor_arriendo_override` del origen, como `recibir()`). |

- Cada ajuste deja **kardex** (`stock_movimientos`): tipo `discrepancia`, `referencia_tipo
  'transferencia'`, `referencia_id` = id de la TRF, motivo `Diferencia <código> · <causa>: <nota>`
  (cortado a 255).
- **Régimen anterior** (el origen se descontó LO ENVIADO al aprobar): `stock_reconciliado = FALSE` **o**
  recibida sin filas en `transferencia_recepciones` (mig 048 sin backfill: la mig 036 dejó TRUE por
  defecto a las que ya estaban 'recibida' antes de Ola 2, 2026-04-21). Las causas que mueven stock →
  **409** `REGIMEN_LEGACY` "Solicitud anterior al cambio de stock: ajusta a mano". `nunca_salio` y
  `origen_envio_de_mas` se permiten, con aviso (lo que nunca salió no se le devolvió al origen / lo de
  más sigue contado en el origen). `GET /discrepancias` devuelve `stock_reconciliado` EFECTIVO (0 si
  aplica cualquiera de las dos) y la pantalla deshabilita de antemano esas causas.
- **Recepciones anteriores al kardex** (2026-05-26): lo recibido sin fila `transferencia_entrada` se
  asume descontado completo del origen; el aviso lo dice ("anterior al kardex").
- **Atómico**: una transacción con `FOR UPDATE` de la discrepancia (guard `pendiente`; si ya no lo
  está → 409 `NO_PENDIENTE`), de la transferencia, de los splits y de las filas de `ubicaciones_stock`
  (orden estable); todo se calcula antes de la primera escritura; rollback ante error.
- **Persistencia** (mig 129): `transferencia_discrepancias.causa` (código) y `ajuste_stock` (JSON
  `{ ajustes, aviso }`, null si se descartó). `GET /discrepancias` las devuelve (null en las antiguas).
  Sin la migración → 409 `MIGRACION_PENDIENTE` al resolver (solo el 1054 de esas columnas; otro 1054
  es un error real). **Descartar funciona sin la migración.**
- **No se elimina** (`DELETE /discrepancias/:id` → 409 `CON_AJUSTE`) una diferencia resuelta cuyo
  `ajuste_stock` tiene ajustes: perdería el registro de por qué cambió el stock.
- «Resolver» en la pantalla usa el mismo permiso que el PUT: `inventario.transferencias.aprobar`.

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

### Edición de facturas post-ingreso + historial

- **`PUT /facturas-inventario/:id`** (gate `gestionar`, mismo permiso que crear/anular — su
  descripción ya cubría "editar"): edita cabecera + ítems. Stock: **reversa lo de los ítems
  previos (GREATEST-clamp, igual que anular) y re-aplica lo de los nuevos**, todo en UNA
  transacción (`SELECT ... FOR UPDATE`). Factura anulada NO es editable (400).
- POST y PUT validan body con `validateBody` (schema compartido, `strip:true` → no se puede
  inyectar `activo`/`registrado_por`).
- **Historial embebido**: cada edición registra en `logs_actividad` (accion UPDATE, modulo
  `facturas-inventario`) un `detalle {cambios, resumen, items_detalle}` armado en el service
  (diff cabecera campo a campo + delta de ítems legible). La anulación también deja registro
  ("Factura anulada — stock revertido"). El PUT de edición y el de anular están **excluidos
  del activityLogger global** (loggean manual, como asistencias/bulk).
- **`GET /facturas-inventario/:id/historial`** (gate `ver`): lista el historial parseado para
  la UI. En el modal de detalle: badge `MODIFICADA` + sección "Historial de cambios".
- Sin kardex: crear/editar/anular NO emiten `stock_movimientos` (hueco preexistente conocido;
  follow-up aparte si se quiere trazabilidad en el kardex para las tres operaciones).

### Bodega Virtual en facturas (mig 099 — detalle en obras-bodegas.md)

- Destino "Bodega Virtual (virtual)" SIEMPRE disponible al ingresar/editar ítems
  (`/bodegas?incluir_virtual=true`): es el punto de entrada para ítems que aún no
  pertenecen a una ubicación física.
- `getAll` expone `monto_virtual` por factura (subquery sobre `factura_items` JOIN
  bodegas `es_virtual=1`, con `fi.obra_id IS NULL` espejando la precedencia obra>bodega
  de `normalizeUbicacion` en filas legacy); `getById` marca ítems con `bodega_es_virtual`.
- El modo del botón (ocultar/mostrar/sumar) ajusta SOLO montos e ítems MOSTRADOS;
  `monto_neto` almacenado y form de edición intactos (documento real).
- Regularización: transferencia virtual→obra/bodega real desde el wizard (la bodega
  participa en transferencias como cualquier otra).

## Export a Excel del Resumen General (`utils/exportExcel.ts`)

- Pie del Excel: **cuatro** filas en este orden — **TOTAL GENERAL → % DESCUENTO POR OBRA →
  DESCUENTO POR OBRA → TOTAL CON DESCUENTO** — con valor **bajo cada columna de obra**, no solo en la
  última. Pedido de obra 2026-07-29: antes las filas de descuento eran globales y dejaban las columnas
  vacías, así que parecía que no había descuentos. El neto se muestra también en obras SIN descuento
  (ahí neto = bruto) para leer la fila de corrido; las bodegas nunca llevan monto (el descuento es por
  obra).
- **`% DESCUENTO POR OBRA`** es fila propia (no va pegado al monto): cada obra tiene su porcentaje
  configurado (ej. Bascuñán 661 = 50%) y "50% -$5.221.869" en una sola celda queda cortado — las
  columnas de obra miden 10. Obra sin descuento va **vacía**, no "0%" (que se leería como un descuento
  fijado en cero). La última columna no lleva % porque no existe un porcentaje global.
- Historial del pie (para no repetir vueltas): existió una fila **"DESCUENTOS APLICADOS"** que
  duplicaba los montos de `DESCUENTO POR OBRA`; obra pidió sacarla, luego reponerla, y finalmente
  **sacarla de nuevo** (2026-07-29). Hoy NO va. Si la vuelven a pedir es un bloque idéntico al de
  `DESCUENTO POR OBRA` con otra etiqueta.
- **Montos redondeados** con el mismo criterio que la pantalla (`Math.round` antes de formatear) y
  descuento con la misma fórmula (`Math.round(total * pct) / 100`). Si divergen, el usuario ve
  "$10.443.738,5" en el Excel y "$10.443.739" en la app y desconfía del reporte.
- **Encabezado congelado**: `views: [{ state: 'frozen', ySplit: 4 }]` en las dos hojas (Resumen
  General y Por Obra) — fila 4 es el encabezado con los nombres de obra. Sin `xSplit`: partiría el
  título mergeado `A1:<última>1`.
- Anti-regresión: `frontend/src/utils/exportExcel.test.ts` **genera el .xlsx y lo reabre** (ExcelJS
  corre en node; `file-saver` mockeado para capturar el Blob) y verifica montos por columna, ausencia
  de la fila duplicada, redondeo y el panel congelado.

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
