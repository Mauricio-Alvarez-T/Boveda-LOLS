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
- **recibida**: cierre. El stock se mueve SOLO por lo **ENVIADO** (origen −, destino +; régimen nuevo,
  por evento), nunca por lo declarado de más o de menos. Lo declarado ≠ enviado → discrepancia
  **pendiente** que se aprueba o se rechaza (§ Discrepancias).
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
- Total → cierra (`recibida`); lo declarado acumulado ≠ enviado genera discrepancia (faltante o
  sobrante); requiere confirmación (checkbox "entrega final" / modal de merma). El total mueve el
  **resto de lo enviado** aunque declare de más, de menos o 0: la diferencia NO entra al stock al
  recibir, queda pendiente hasta que se apruebe o rechace (§ Discrepancias).
- Over-receive en parcial bloqueado (400, el tope suma las entradas repetidas de un mismo ítem);
  sobrantes solo vía recepción total.
- SoD por evento de recepción (receptor ≠ transportista).
- En `solicitud_materiales` la recepción es simple: confirmar con observación de sobrantes
  (`MaterialesRecepcionPanel`), cierra con tipo 'total'.

## Bodeguero — scoping por bodega destino (mig 097)

- `usuarios.bodega_id` (NULL = sin bodega, comportamiento clásico). Se asigna en el form de
  usuario (Configuración → Usuarios → "Bodega Asignada"); vive en el JWT → **re-login tras
  asignar/cambiar** (el PUT bumpea la versión del rol para forzarlo).
- **Visibilidad**: sin `ver_todas`, un usuario con bodega ve sus propias solicitudes **+ las
  transferencias DESTINADAS a su bodega** (`getAll`: `solicitante_id = ? OR destino_bodega_id = ?`;
  `GET /:id` también lo permite). Excepción (2026-10-22): con `inventario.transferencias.aprobar`, `GET /:id`
  abre también una solicitud **pendiente** ajena — las pendientes ya le llegan globales (`/pendientes`, fichas
  del Inicio) y para aprobarla tiene que poder abrirla. Ya aprobada, vuelve la regla normal.
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
`/inventario?tab=transferencias&estado=pendiente|aprobada|discrepancias|todas` (Inventario lee `tab`,
`estado` e `id` solo al entrar). Lógica del frontend en `resumenInventarioInicio.ts` (con test).

### Fichas del detalle (`GET /api/transferencias/inicio/fichas?limit=`, 2026-10-22)

`transferenciaService.fichasInicio(user, { limite })` (`inventario.ver`, también antes de `/:id`): las
solicitudes detrás de esas cifras, una ficha por solicitud, para el detalle «Fichas por solicitud» del Inicio
(`DetalleInventario`; lógica en `fichasInventarioInicio.ts`, con test). Devuelve `{ conteos, limite, fichas }`;
`conteos` es `resumenInicio(user)` sin cambios (los totales del filtro).
- **Mismo alcance que la tarjeta**: `_etapasInicio` copia los permisos, condiciones y alcance de
  `resumenInicio` (el test compara el SQL de los dos en 5 perfiles; si se cambia uno, se cambia el otro).
  Única diferencia: diferencias va con `EXISTS` (el `JOIN` repetiría la ficha por ítem). `mis_solicitudes`
  no genera fichas. Una solicitud en dos etapas da UNA ficha: diferencias > por recibir > por despachar >
  por aprobar.
- `limit` es **por etapa** (`normalizePagination`: 50 por defecto, máximo 100; las más antiguas). Consultas
  fijas: una por etapa + ítems, ítems personalizados (`aprobado = 1`) y diferencias en lote (`IN (?)`).
  **Nunca columnas de $**: de los ítems solo descripción y unidad.
- Cada ficha: código, estado, `tipo_flujo`, etapa, origen y destino (obra o, si no, bodega), solicitante,
  `dias` en la etapa (desde la solicitud, la aprobación, el despacho o la recepción), `estancada` (solo por
  aprobar: 10 días o la prórroga, la regla del Resumen Ejecutivo), ítems (`recibida` solo si ya hubo
  recepción) y, en diferencias, las pendientes ≠ 0 con `faltan` y `sobran`.
- **Acción según quien mira** (`accion` + `bloqueo`, copia de `useTransferenciaDetail`): por aprobar →
  Aprobar (SoD: no la propia, salvo `sod_bypass`); diferencias → Resolver (`aprobar`); por despachar y por
  recibir → **Recibir** (`recibir`; SoD: no quien la aprobó / quien la despachó; con `bodega_id`, solo las de
  su bodega). **La interfaz no tiene «Despachar»** (desde 2026-04-14; `recibir()` acepta `aprobada`). Solo
  elige el enlace de la ficha: aprobar, recibir y resolver validan todo de nuevo al ejecutarse.
- La ficha no aprueba ni recibe (piden formulario): abre Inventario con esa solicitud,
  `/inventario?tab=transferencias&estado=…&id=N`. Con `estado=discrepancias`, `TransferenciasPanel` la elige
  de la lista de diferencias pendientes que ya trae; si no está (la lista trae las 50 más nuevas y el Inicio
  muestra primero las más antiguas), la busca una vez con `limit=200` y, si ya no está pendiente, avisa. Con otro
  estado la abre por `GET /:id`.

## Discrepancias

Regla del dueño (2026-10-21, mig 130). Reemplaza el modelo de «resolver eligiendo la causa» de la mig 129,
que solo llegó a staging. La columna `causa` quedó sin uso.

- **Recepción**: `recibir()` mueve SOLO lo **ENVIADO**. Por ítem, lo movido hasta ahora es
  `min(declarado acumulado, enviada)`:
  - un evento `parcial` lo lleva a `min(declarado nuevo, enviada)`;
  - el `total` que cierra lo lleva a la enviada completa.

  Se mueve `delta = después − antes`. Así funciona cada régimen:
  - **Régimen nuevo**: el origen baja por FIFO de splits (`transferencia_item_origenes.cantidad_decrementada`)
    y el destino sube.
  - **Legacy** (`stock_reconciliado = FALSE`): el origen ya descontó lo enviado al aprobar, así que solo
    sube el destino.

  Lo **declarado** se acumula en `transferencia_items.cantidad_recibida` y en `transferencia_recepcion_items`.
  Kardex `transferencia_salida`/`transferencia_entrada` por lo movido.

  La recepción ya no crea stock sin respaldo: antes, un sobrante declarado salía del origen con
  `GREATEST(…, 0)` y, si el origen no alcanzaba, «se creaba» stock en el destino.
- **Se crean** al cerrar (`total`) si lo declarado acumulado ≠ `cantidad_enviada`: una fila en
  `transferencia_discrepancias` con `cantidad_recibida` = lo declarado y **`diferencia_aplicada = 0`**. Esa
  diferencia **NO está en el stock**: queda **pendiente**. El 0 va literal en el INSERT, nunca NULL.
  - Un `item_id` repetido en el payload no mueve dos veces y genera una sola discrepancia.
  - Sin la mig 130, la recepción con diferencia responde **409** `MIGRACION_PENDIENTE`. No inserta sin la
    columna, porque NULL cuenta como «regla antigua».
- Vista propia (chip Diferencias en Transferencias). Borrar la transferencia borra sus diferencias por
  CASCADE; si alguna movió stock o es una pendiente de la regla anterior, el borrado responde **409** y no borra
  nada (el CASCADE no se las lleva en silencio; § Lectura y borrado).
- **Signo**: en la BD, `diferencia` es `enviada − recibida` (positivo = faltante; la UI la lee así). Las
  operaciones usan `dif = recibida − enviada`: **sobrante** si es > 0, **faltante** si es < 0.

### Aprobar o rechazar lo declarado (`PUT /api/transferencias/discrepancias/:id/resolver`)

Body: `{ estado: 'resuelta'|'descartada', resolucion? }`. Query opcional: `?simular=1` (§ Simular).
Respuesta: `{ id, estado, resolucion, ajustes: [{ ubicacion_nombre, obra_id, bodega_id, antes, despues, cantidad }],
aviso, transferencia_id, transferencia_codigo, item: { id, descripcion, nro_item, unidad }, simulado }`, más
**`cerrada_regla_anterior: true`** (solo viene cuando es true) al aprobar una de la regla anterior: se cerró sin mover
stock y la UI lo muestra como información, no como «se aplicó la diferencia».
Implementación: `transferenciaService.resolverDiscrepancia`. Permiso: `inventario.transferencias.aprobar`.
Lo usa quien lleva el inventario: el receptor no puede corregir su recepción después.

| Botón | Diferencia | Stock |
|---|---|---|
| **Resolver = APROBAR** lo declarado | Sobrante (`dif > 0`) | Destino **+dif** y origen primario **−dif** (`transferencia_items.origen_*` ?? cabecera, el mismo helper que `recibir()`). Si el origen tiene menos, queda en **0** (nunca negativo) y el `aviso` dice cuántas unidades quedaron sin respaldo. |
| **Resolver = APROBAR** lo declarado | Faltante (`dif < 0`, `f = −dif`) | Destino **−f**. Si el destino tiene menos que `f`: **409** `DESTINO_SIN_STOCK` («`<destino>` ya no tiene esas f unidades (hoy tiene M): ajústalo a mano»), sin escribir nada. Al origen vuelve **lo que de verdad salió de más**, no `f` a ciegas (ver abajo). |
| **Resolver** sobre la regla anterior | Cualquiera (`diferencia_aplicada` 1 o NULL) | **No mueve stock**: lo declarado ya está en el stock. Se cierra con `ajustes: []`, el aviso «Regla anterior: la diferencia ya estaba aplicada; se cierra sin mover stock» y `cerrada_regla_anterior: true`. |
| **Descartar = RECHAZAR** lo declarado | Cualquiera (regla nueva) | **No mueve stock**: ya tiene lo enviado. Sirve cuando quien recibió se equivocó al digitar o al contar. Sobre la regla anterior: **409** `REGLA_ANTIGUA` (primero se rehace). |

**Faltante aprobado: lo que vuelve al origen** (revisión 2026-10-21). `recibir()` sube
`cantidad_decrementada` por lo enviado aunque el `GREATEST(…, 0)` recorte cuando el origen no tenía stock; devolver
`f` completo creaba stock. Por eso vuelve `min(f, max(0, salido − recibida))`:
- `salido` = Σ(`cantidad_anterior − cantidad_nueva`) del kardex con `referencia_tipo = 'transferencia'`,
  `referencia_id` = la TRF y ese ítem, en ubicaciones **distintas del destino**: las `transferencia_salida` de
  `recibir()` y las `discrepancia` de un rehacer en el origen (lo devuelto resta). Helper `_salidoDelOrigen`.
- **Kardex parcial** (un viaje anterior al kardex del 26-may-2026 y otro después), igual que `_descontadoDelOrigen`:
  lo que `recibir()` llevó al destino sin `transferencia_entrada` se asume salido completo del origen.
  `sinKardex = max(0, movidoAlDestino − Σ entradas)`, con `movidoAlDestino` = la **enviada** (regla nueva: la
  recepción mueve lo enviado) o la **recibida** si la recepción fue de la regla anterior (la fila se rehízo o sigue
  siendo de esa regla: esa regla movía lo declarado). `salido = salidas + sinKardex + discrepancias`. Con `sinKardex > 0`
  no hay tope por ubicación (no se sabe de dónde salió esa parte).
- Sin ningún kardex de la recepción, eso da `salido = enviada` (o lo recibido si la fila se rehízo en régimen nuevo,
  más lo que movió el rehacer).
- Con la entrada completa y sin salida, el origen estaba en 0 al despachar: `salido = 0`.
- Legacy (`stock_reconciliado = FALSE`) o fila rehecha en régimen `anterior`: el origen descontó lo enviado fuera
  del kardex por viaje → `salido = enviada`.

Ese total va primero a los splits en orden **INVERSO** (baja `cantidad_decrementada`), hasta lo que cada uno
descontó y, con kardex, **sin pasar de lo que salió de esa ubicación**: un split que no tenía stock no gana unidades
que nunca perdió. El resto va al origen primario. Si vuelve menos que `f`, el `aviso` lo explica: «Al origen vuelven
solo N de las F unidades: el origen no tenía esas unidades al despachar (salieron S de las M enviadas).» Si no vuelve
nada: «Al origen no vuelve ninguna de las F unidades: …».

- **Kardex** de cada ajuste (`stock_movimientos`):
  - tipo `discrepancia`;
  - `referencia_tipo` `'transferencia'` y `referencia_id` = id de la TRF;
  - motivo «Diferencia aprobada TRF-…: llegaron N de M enviados (sobrante|faltante X) · nota», cortado a 255.
- **`resolucion` es opcional**. Vacía, se guarda un texto generado: «Aprobada: llegaron N de M enviados» o
  «Rechazada: queda lo enviado (M)». Una `causa` que llegue se ignora (el strip del schema la descarta).
- `ajuste_stock` (TEXT, JSON) = `{ ajustes, aviso }` (los ajustes con `antes`/`despues`), también al descartar y al
  cerrar una de la regla anterior (con `ajustes: []`). Si la fila se rehízo antes, se conserva `rehecha` anidado.
- **Atómico**: una sola transacción, con `FOR UPDATE` en este orden:
  1. la discrepancia: si no está `pendiente`, **409** `NO_PENDIENTE`;
  2. la transferencia;
  3. los splits;
  4. las filas de `ubicaciones_stock` tocadas, en orden estable.

  Todo se calcula antes de la primera escritura y hay rollback ante error. Sin la mig 130: **409**
  `MIGRACION_PENDIENTE` (solo para el 1054 de `diferencia_aplicada`; otro 1054 es un error real).
- **Choque con otra transacción** (deadlock, errno 1213, o espera de lock agotada, 1205) en `resolver`, `rehacer`,
  `DELETE /discrepancias/:id` y `DELETE /transferencias/:id`: rollback y **409** `REINTENTAR` «Otra persona está
  trabajando en esta solicitud: reintenta en unos segundos» (antes salía un 500 con el texto de MySQL). Es
  pasajero: se reintenta igual.

### Simular (`?simular=1` en `/resolver` y en `/rehacer`)

- **Estricto** en las dos rutas: `1` o `true` simula; ausente, `0` o `false` ejecuta; cualquier otro valor
  (vacío, `si`, `TRUE`, repetido) → **400** «El parámetro simular debe ser 1, true, 0 o false».
- `/resolver?simular=1` corre la misma lógica dentro de la transacción (mismos `FOR UPDATE`, mismos cálculos) sin
  escribir stock, kardex, splits ni la fila, y hace rollback. Responde lo mismo que el real más **`bloqueo`**:
  - `null` si se puede;
  - `{ code, message }` donde lo real respondería 409 (`DESTINO_SIN_STOCK`, `REGLA_ANTIGUA`, `NO_PENDIENTE`,
    `MIGRACION_PENDIENTE`): la simulación responde **200** con `ajustes: []` y el bloqueo, para mostrarlo antes de
    confirmar. 400 y 404 siguen siendo error, y también el **409 `REINTENTAR`**: no es un bloqueo (es pasajero),
    así que no deshabilita Confirmar.
  - Descartar simulado → `ajustes: []`.
- `/rehacer?simular=1`: § Diferencias de la regla anterior.

### Diferencias de la regla anterior (`diferencia_aplicada = 1`)

La mig 130 marcó con 1 todas las filas que ya existían. En ellas `recibir()` **aplicó lo declarado al
stock**. NULL se trata igual que 1; solo un 0 o `false` explícito es regla nueva.
- **Aprobarlas** (`resuelta`) se permite y **no mueve stock**: cierra la fila con `ajustes: []`, el aviso «Regla
  anterior: la diferencia ya estaba aplicada; se cierra sin mover stock» y `cerrada_regla_anterior: true` en la
  respuesta (también al simular). Sirve para las que no hay que tocar, y deja borrar la fila o su transferencia.
- **Rechazarlas** (`descartada`) responde **409** `REGLA_ANTIGUA` («Esta diferencia es de la regla anterior (ya está
  en el stock): para rechazarla primero hay que rehacerla»): sacar lo declarado del stock requiere rehacerla.

**`POST /api/transferencias/discrepancias/:id/rehacer?simular=1`**: solo **Super Administrador**
(`rol_id = 1`), además de `inventario.transferencias.aprobar`; cualquier otro recibe 403.
Implementación: `transferenciaService.rehacerDiscrepancia`.

Deja el stock como si la recepción hubiera traído lo **ENVIADO** y reabre la fila:
- `estado = 'pendiente'` y `diferencia_aplicada = 0`;
- `resolucion`, `resuelto_por` y `fecha_resolucion` quedan en NULL;
- la decisión anterior se conserva en `observacion` («Resolución anterior (regla antigua): <estado> ·
  <resolución>»);
- el plan aplicado se guarda en `ajuste_stock.rehecha`.

Después se aprueba o se rechaza con la regla nueva. Con `simular=1` corre el mismo plan, con los mismos
bloqueos y avisos, y hace rollback: no escribe nada.

| Régimen de la TRF | Sobrante (`dif > 0`) | Faltante (`f = −dif`) |
|---|---|---|
| **Nuevo** (`stock_reconciliado` TRUE **y** con filas en `transferencia_recepciones`). La regla anterior sacó del origen lo RECIBIDO. | Destino **−dif**: si no alcanza, **baja hasta 0** y el aviso dice cuántas no se pudieron quitar («`<destino>` no tenía esas unidades: no se pudieron quitar N de las M (quedó en 0)»); antes era 409, ahora lo ve el Super Admin en la simulación. Al origen primario vuelve lo que `recibir()` le sacó por sobre lo enviado, **medido en esa ubicación** (revisión 2026-10-21): `min(dif, max(0, salidas del kardex en el origen primario − Σ cantidad_decrementada de los splits de esa ubicación − lo que los splits no cubren de la enviada))`; sin splits, la base es la enviada completa. Así un split corto en otra ubicación no le quita lo que sí salió de más del origen primario (antes se restaba del total). Si parte de lo recibido no tiene `transferencia_entrada` (antes del kardex), se asume descontado completo, se usa la regla global `min(dif, max(0, salidas − enviada))` (`_descontadoDelOrigen`) y lleva aviso. Lo enviado que no salió (el origen no lo tenía) va al aviso «Al recibir, el origen no tenía todo lo enviado: N unidades salieron sin respaldo». | Origen **−f**: saldos de los splits FIFO (sube `cantidad_decrementada`) y el resto del origen primario, sin bajar de 0 (con aviso). Destino **+f**. |
| **Anterior** (`stock_reconciliado` FALSE **o** recibida sin eventos de recepción: el origen descontó lo ENVIADO y el destino sumó lo recibido) | Destino **−dif** (si no alcanza, baja hasta 0 con el mismo aviso). El origen no se toca. | Destino **+f**. El origen no se toca. |

- **Ajustes manuales posteriores** (aviso, también al simular): si desde `transferencias.fecha_recepcion` hay
  movimientos del ítem en el origen primario, los orígenes de los splits o el destino que **no vienen de una
  transferencia** (kardex `ajuste_manual`, o `discrepancia` cuya `referencia_tipo` no es `'transferencia'`, p. ej.
  la de un conteo), el aviso los lista: «Hubo ajustes manuales después: <dd-mm-aaaa hh:mm> <ubicación> a→b
  (<usuario>); … Puede que ya esté corregido: revísalo antes de rehacer.» Muestra hasta 5 («y N más»). Helper
  `_ajustesPosteriores`. Las diferencias aprobadas o rehechas de **otras** transferencias en la misma ubicación no
  se listan (revisión 2026-10-21): mueven el stock pero no corrigen esta, y el aviso sugeriría lo contrario.
- Choque con otra transacción → **409** `REINTENTAR`, también al simular (§ Aprobar o rechazar).
- Kardex tipo `discrepancia`, motivo «Rehecha con la regla nueva (21-oct): TRF-…, llegaron N de M enviados;
  el stock queda con lo enviado».
- Respuesta (simulada o no): `{ id, transferencia_id, transferencia_codigo, item: { id, descripcion, nro_item,
  unidad }, enviada, recibida, dif, regimen: 'nuevo'|'anterior', ajustes: [{ ubicacion_nombre, obra_id, bodega_id,
  antes, despues, cantidad }], aviso, estado_anterior, simulado }`.
- No se rehace:
  - una fila que ya es de la regla nueva → **409** `YA_REGLA_NUEVA`;
  - una resuelta con el modelo de causas que ajustó stock (`causa` no nula o `ajuste_stock.ajustes` con
    filas) → **409** `CON_AJUSTE`. El kardex de la recepción no ve ese ajuste y se ajustaría dos veces:
    va a mano. Solo hay de estas en staging.
- Sobre el régimen anterior: la mig 036 dejó TRUE por defecto a las que ya estaban `recibida` antes de
  Ola 2 (2026-04-21), y la tabla `transferencia_recepciones` (mig 048) no tiene backfill. Por eso «sin
  eventos» delata el régimen anterior. Esto incluye las recibidas del 21-abr al 20-may, que descontaron
  lo enviado al recibir.

### Nombres de ubicación

`ubicacion_nombre` de los ajustes, `origen_nombre`/`destino_nombre` del listado y las ubicaciones de los avisos salen
de `_nombresUbicaciones`: la obra por su nombre y la bodega como «nombre (responsable)» si tiene
`responsable_nombre`, igual que `formatBodegaNombreResponsable` del frontend (`utils/formatBodega.ts`).

### Log de actividad

El `activityLogger` global **excluye** `POST …/discrepancias/:id/rehacer` y `PUT …/discrepancias/:id/resolver`
(con o sin `?simular`): quedaban como CREATE/UPDATE genérico sin la TRF ni los ajustes, y la simulación, que no
escribe nada, también se registraba. La ruta registra con `logManualActivity` **solo lo real**: módulo
`transferencias`, acción UPDATE, `item_id` = id de la TRF (entidad `transferencia` con su código) y `detalle` con
`resumen` («Diferencia #31 aprobada (TRF-… · <ítem>)» / «rechazada» / «rehecha con la regla nueva …: vuelve a
pendiente»), `discrepancia_id`, la TRF, el ítem, los `ajustes` y el `aviso` (rehacer agrega `regimen` y
`estado_anterior`). Aprobar una de la regla anterior agrega al resumen «: regla anterior, se cierra sin mover stock»
y `cerrada_regla_anterior: true` al detalle. Un error del service no se loguea.

### Lectura y borrado

- `GET /discrepancias` devuelve, por fila:
  - `diferencia_aplicada`: `true` = regla antigua (la columna en 1 **o en NULL**, igual que el service), `false` =
    regla nueva, `null` **solo si falta la columna** (mig 130 sin aplicar);
  - `ajuste_stock` parseado;
  - `origen_nombre` y `origen_stock_actual` del origen primario (última fila de `transferencia_items` del
    ítem ?? cabecera);
  - `destino_nombre` y `destino_stock_actual`.

  Con eso la pantalla arma el mensaje de qué va a pasar al aprobar o rechazar, y advierte si no alcanza.
  La transferencia trae además `origen_*_id` y `destino_*_id` y el `stock_reconciliado` EFECTIVO (0 si es
  del régimen anterior).
- **`DELETE /discrepancias/:id`** corre en una transacción: `SELECT … FOR UPDATE` de la fila, las guardas sobre esa
  lectura y el `DELETE` (nadie la aprueba o la rehace entre la guarda y el borrado). **No se elimina**:
  - una diferencia cuyo `ajuste_stock` (o `rehecha`) movió stock → **409** `CON_AJUSTE`;
  - una **pendiente de la regla anterior** (su diferencia ya está en el stock) → **409** `REGLA_ANTIGUA`: «Esta
    diferencia es de la regla anterior y ya está en el stock: primero apruébala (se cierra sin mover stock) o pide
    que la rehagan.» Aprobada (cerrada sin mover stock), ya se puede borrar.

  Las demás sí se borran (sin tocar stock).
- **`DELETE /transferencias/:id`** (`eliminar`) ya no se lleva en silencio, por CASCADE, esas diferencias: tras
  bloquear la TRF lee sus diferencias con `FOR UPDATE` y responde **409** `CON_AJUSTE` («TRF-… tiene una diferencia
  que ya ajustó el stock: no se puede eliminar (el ajuste quedaría sin su registro).»; en plural «N diferencias que
  ya ajustaron») o **409** `REGLA_ANTIGUA`: «TRF-… tiene una diferencia pendiente de la regla anterior (ya está en el
  stock): primero apruébala (se cierra sin mover stock) o pide que la rehagan.» (en plural: «N diferencias
  pendientes … (ya están en el stock): primero apruébalas (se cierran sin mover stock) o pide que las rehagan.»).
  Sin las columnas de las mig 129/130 cae a menos columnas y no bloquea.
- Los dos borrados, ante un choque con otra transacción → **409** `REINTENTAR`.

### Pantalla (`DiscrepanciaDetail`, lógica pura en `mensajeDiferencia.ts` con test)

- Al abrir **Resolver** o **Descartar** se pide `PUT …/resolver?simular=1` con el mismo body y se muestra
  lo que devuelve: «`<receptor>` declaró N de M enviados», el rótulo «Así queda el stock:» y, por ubicación,
  «`<ubicación>`: hoy A → quedará B (±N)», el `aviso` y, si viene `bloqueo`, el motivo con **Confirmar
  deshabilitado**. Con la simulación lista **no** se muestra la frase fija del efecto; la frase fija (en
  condicional: «se sumarían / se restarían …, según el stock real») queda solo sin simulación, mientras carga
  o si falló. Mientras carga, esqueleto (Confirmar deshabilitado). Si la simulación falla, texto genérico y
  Confirmar habilitado: decide el servidor (el stock de la lista es una foto vieja y **no se usa para
  bloquear**). Un `bloqueo` `NO_PENDIENTE` se trata como «ya resuelta»; un `bloqueo` `REINTENTAR`, como
  simulación fallida.
- Mientras se confirma la ventana **no se cierra** (Cancelar, X, Esc, fondo ni arrastre) y la respuesta de
  un turno viejo de la ventana o de la simulación se ignora.
- **400/409 al confirmar**: se vuelve a pedir la simulación (el stock pudo cambiar) y «Calculado con el stock
  de este momento» no aparece hasta tenerla. El error se muestra dentro de la ventana (si la simulación nueva
  trae un `bloqueo`, ese lo reemplaza). **409 `REINTENTAR`**: toast con el mensaje y la ventana queda abierta
  para reintentar.
- Aprobar una de la **regla anterior** (respuesta con `cerrada_regla_anterior`): toast «Diferencia cerrada
  (regla anterior): no se movió stock». Su aviso («… se cierra sin mover stock») se muestra en tono neutro,
  no ámbar, en la ventana y en la fila cerrada.
- **Regla anterior** (`diferencia_aplicada = true`), pendiente: «Resolver» habilitado («Regla anterior: la
  diferencia ya está en el stock; aprobar la cierra sin mover nada»); «Descartar» deshabilitado («primero
  hay que rehacerla (Super Administrador)»). «Rehacer con la regla nueva» solo para `rol_id = 1` y solo si
  la fila no ajustó stock (`causa` o `ajuste_stock.ajustes`); si ajustó: «Se resolvió con ajustes: se
  corrige a mano».
- **409 `NO_PENDIENTE` / 404** (y `YA_REGLA_NUEVA` al rehacer): toast informativo con el mensaje del
  servidor, se cierra la ventana y se refresca. Al simular (abrir la ventana) dice «Otra persona ya la
  resolvió» (o «la rehízo» / «Esta diferencia ya no está»); al confirmar agrega «: no se aplicó tu decisión».
- Tutorial de Ayuda: mientras la simulación carga, el globo dice «Calculando cómo queda el stock…»; solo con
  un `bloqueo` dice que no se puede aprobar.
- **Papelera**: con `CON_AJUSTE` o pendiente de la regla anterior se ve deshabilitada y al tocarla explica
  por qué. El borrado no muestra éxito si falló.
- Nota vacía: «Si la dejas vacía se guarda un texto automático» (no se promete el texto exacto).
- Ventana de rehacer: el aviso de ajustes manuales posteriores («Hubo ajustes manuales después: …») se
  muestra aparte, como lista.

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
