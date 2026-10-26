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
- **Quién aprueba** (`inventario.transferencias.aprobar`: aprobar o rechazar solicitudes y resolver diferencias): solo
  **Leonardo López**, como permiso propio, y el Super Administrador. La mig 131 se lo quitó al rol Administrador y la
  133 a todos los demás roles y permisos propios (detalle y re-login: seguridad-rbac.md § Roles).

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

## Inicio por perfil (`GET /api/transferencias/inicio/perfil`, 2026-10-22)

Detalle «Inventario» del Inicio, lo que se abre bajo la tarjeta (sus cifras: § Tarjeta «Inventario» del Inicio, abajo).
El dueño eligió del lienzo: **Leonardo** (quien aprueba) → opción A, **Daphne** (jefatura, «Ver diferencias» sin
aprobar) → opción B, **jefes de obra y prevencionistas** → opción A, y **Marcos y Mauricio** (Super Administrador) →
la vista «Super Administrador» de la opción A (sin «Ver como» desde 2026-10-26: las vistas de los demás se revisan en
Soporte · usuarios, seguridad-rbac.md § Ver como usuario).
`transferenciaService.inicioPerfil(user)` (`inventario.ver`, ruta ANTES de `/:id`) devuelve `{ data }` con todo lo que
necesitan las tres vistas. Solo usa columnas y reglas que ya están en producción. Contrato (tipos) y carga:
`frontend/src/components/dashboard/widgets/inventarioPerfil/` (`tipos.ts`, `useInventarioPerfil.ts`). Test:
`backend/tests/transferencias_inicio_perfil.test.js`.

- **Alcance = el de `GET /:id` en producción**, para que todo lo que sale se pueda abrir: con `ver_todas`, todas las obras;
  sin él, las propias + las destinadas a su bodega (mig 097), el mismo `WHERE` del listado (`getAll`). Vale para todo: el
  circuito, las listas y las diferencias. Consecuencias:
  - Quien aprueba **sin** `ver_todas` no recibe pendientes ajenas (en producción `GET /:id` le daría 403); hoy no hay
    nadie así: Leonardo y Daphne tienen `ver_todas` (rol Administrador).
  - La **obra asignada** del token (`usuarios.obra_id`) no amplía nada (`GET /:id` no abre por obra): solo da el nombre
    (`obra`), para «por recibir en Domeyko».
  - Sin obras de prueba ni finalizadas (`EXCLUIR_OBRAS_PRUEBA`), como `resumenInicio`. Las canceladas no salen.
- **`perfil`**: `aprueba` (tiene `aprobar`; también el Super Administrador), `jefatura` (`diferencias_ver` sin `aprobar`),
  `obra` (el resto). Además `super_admin` (rol 1), `alcance`, `puede` (aprobar, ver/resolver diferencias, solicitar, recibir,
  sod_bypass) y `hoy` (`CURDATE()` de la BD, la misma fecha con que se cuentan los días).
- **`circuito`** (una consulta, cifras exactas): Pedida (`pendiente`), Aprobada (`aprobada`, por recibir), Despachada
  (`en_transito` o `recepcion_parcial`; desde 2026-10-23 las vistas la suman a Aprobada: § Circuito de tres pasos), cada una con `{ total, dias }` (días de la más antigua en esa etapa); Recibida =
  recibidas **este mes** + `ultima` (fecha de la última recibida); Diferencias aparte = solicitudes con diferencias
  `pendiente` ≠ 0 (`total`, como la tarjeta), `items` (cuántos ítems), `dias` (desde la recepción) y `mas_antigua_id`
  (la solicitud de la más antigua, o null). El circuito viene para todos con su alcance: así la obra tiene el aviso
  «1 diferencia sin aclarar» sin ver la lista, y al tocarlo se abre esa solicitud suya (`estado=recibida&id=N`: las
  diferencias solo nacen al cerrar la recepción), no la pestaña «Diferencias», que no puede ver.
- **`solicitudes`** (una consulta `UNION ALL`): las en curso con **una parte por etapa** —pendientes · aprobadas · en
  tránsito o recepción parcial—, cada una con su tope de 200 y las más antiguas primero (con un tope común, las aprobadas
  viejas, que siguen «aprobada» hasta que la obra recibe, dejaban fuera las pendientes de la bandeja de quien aprueba), recibidas (las del mes y, como mínimo, las 10 últimas; se leen hasta 100) y rechazadas de
  este mes (tope 50). Cada una: código, estado, `etapa`, `tipo_flujo`, `tipo`, origen y destino (obra, o bodega con su
  responsable), solicitante con su **rol** (`roles.nombre`; los usuarios no tienen cargo propio. Es un rol de ACCESO: como
  «cargo» del lienzo se muestra solo si se lee como uno —Jefe de Obra, Prevencionista, Bodeguero…—, no «En Terreno» ni
  «Administrador»: `cargoDe` de `leonardo.modelo.ts`), `propia`, y quién y cuándo aprobó, despachó, recibió o rechazó (con el motivo), los `dias` en la etapa actual
  (SQL con `CURDATE()`), `del_mes` e ítems.
  - `tipo`: `materiales` = `solicitud_materiales` (o solo ítems personalizados: materiales de construcción, se compran);
    `herramientas` = lleva ítems del catálogo (equipos y herramientas).
  - Personas con los respaldos de la mig 039: despachó = `transportista_id ?? despachado_por` (push directo y orden de
    gerencia llenan solo `*_por`); recibió = `receptor_id ?? recibido_por`. La interfaz no tiene «Despachar»: muchas
    recibidas no tienen despacho (`despacho: null`).
  - **Rechazadas**: `rechazar()` pisa `aprobador_id` y `fecha_aprobacion` con quien rechazó y cuándo. Por eso el rechazo
    sale de `rechazado_por` + `fecha_aprobacion`, y la aprobación previa solo de `aprobado_por`, sin fecha.
  - Recepción parcial: `recepcion` es null (el receptor se graba al cerrar) y `ultima_recepcion` trae el último viaje
    (`transferencia_recepciones`).
  - Ítems: descripción, unidad, `pedida`, `enviada` (catálogo: `cantidad_enviada`; personalizado: `cantidad_aprobada`) y
    `recibida` (null antes de la primera recepción). Los personalizados que quien aprobó quitó (`aprobado = 0`) no van.
  - `origenes_extra`: de cuántos lugares MÁS, además de `origen`, sale la solicitud. `aprobar()` guarda en la cabecera
    solo el origen «principal» (el primer split con cantidad), pero puede sacar de varias bodegas y obras. Cuenta los
    lugares distintos de los splits con cantidad (`transferencia_item_origenes`, mig 032), del origen de cada ítem
    (`transferencia_items.origen_*`, mig 029) y de los personalizados que salen de una obra (`origen_obra_id`, mig 071).
    0 con uno solo o ninguno.
- **SoD** en cada pendiente, si quien mira tiene `aprobar`: `puede_aprobar` (false si la pidió él mismo y no tiene
  `sod_bypass`, con `bloqueo_aprobar: 'sod_solicitante'`, para mostrar la nota en vez del botón); null si no aplica.
  `aprobar()` lo vuelve a validar.
- **`diferencias`**, solo con `aprobar` **o** `diferencias_ver` (null sin ellos; no se consultan): por ítem pendiente ≠ 0
  (las más antiguas primero, tope 100): solicitud, ítem, unidad, enviada, recibida, `diferencia` (enviada − recibida),
  `faltan` / `sobran`, origen → destino, quién aprobó, despachó (o null) y recibió (`reportado_por ?? receptor`), y cuándo,
  y días desde la recepción. Con el alcance de arriba (para Leonardo y Daphne es global, como la pestaña).
- **`aprobadores`**: quiénes aprueban hoy (permiso efectivo `aprobar` = rol + grant − deny, como `permisosService`), activos
  y **sin Super Administrador**; es lo que permite escribir «Esperando a Leonardo» y «Apurar a Leonardo» sin dejar el nombre
  fijo. Vacío si nadie (p. ej. en test, donde Leonardo puede no existir). Desde la mig 133 es solo Leonardo: ningún
  rol trae `aprobar` salvo Super Administrador, que no se lista.
- **Solo lo que la app registra**: los WhatsApp no quedan guardados (no hay «le preguntó a…») y los usuarios no tienen
  teléfono: los botones abren WhatsApp con el mensaje listo y la persona elige el contacto (`utils/whatsappShare.ts`).
- **Consultas fijas, sin N+1**: circuito, lista, aprobadores, diferencias (si corresponde) y la obra del token (si tiene) en
  paralelo; después ítems, personalizados y lugares de origen en lote (`IN (?)`), solo si hay solicitudes. **Nunca columnas de $**: todo va
  campo a campo (nada de `t.*`), de `items_inventario` solo descripción y unidad. Fechas `'YYYY-MM-DD'` (hora local de la
  BD). Los topes vienen en `limites`.

### Circuito de tres pasos: bodegueros y conductores fuera del ciclo (2026-10-23)

**Don Luis: bodegueros y conductores fuera del ciclo de solicitud** (Marcos 2026-10-23, tras hablarlo con Mauricio).
En la app el ciclo real tiene tres pasos: **Pedida → Aprobada → Recibida** (+ diferencias). Las cuatro vistas del
detalle (Leonardo, jefatura, obra y Super Admin) dibujan ese circuito, **sin «Despachada»**:
- Las solicitudes `en_transito` o `recepcion_parcial` (nacen así por envío directo u orden de gerencia) se cuentan
  **dentro de «Aprobada · por recibir»**: cifra = `circuito.aprobada.total + circuito.despachada.total`, días = el
  máximo de los dos (`porRecibirCircuito` de `inventarioPerfil/formato.ts`, con test). El contrato del servidor **no
  cambia**: sigue mandando `despachada` y `despacho`; la suma es del frontend. Si alguna por recibir está en tránsito, el
  enlace de «Aprobada» abre «Todas» en Inventario (el filtro «Aprobadas» no la muestra).
- **Nunca se nombra a quien despachó** (aunque la app lo tenga registrado): sin caja «Bodega», sin paso «Despachar», sin
  eventos «despachó», sin «En octubre X despachó N», sin «antes despacharon …». Una fila en tránsito puede decir «En
  camino» y «Salió de Paraguay el 21 oct» (origen y fecha), nunca «despachó X».
- En Diferencias, «Quién lo hizo» = **Aprobó** (quien aprobó, que es quien las resuelve) + **Recibió**, cada uno con su
  WhatsApp. El mensaje a quien recibió cierra «¿Me cuentas qué pasó?»; a quien aprobó, «¿La puedes revisar?»
  (`CIERRE_DIFERENCIA` de `jefatura.modelo.ts`). Nunca se le escribe a un despachador.

### Qué vista ve cada uno (frontend)

`DetalleInventario` elige con `vistaInventario` (`inventarioPerfil/perfil.ts`, con test; los permisos que mira son
constantes exportadas de ese archivo), en este orden. **Regla firme (2026-10-23)**: en producción los roles y los
permisos de cada persona (grant / deny) se arman a mano, así que un rol puede traer combinaciones inesperadas; cada vista
pide la **combinación** de permisos con que funciona, no un permiso suelto. Antes bastaba `aprobar` para la vista de Leonardo: un jefe de obra con `aprobar`
caía en la bandeja de todas las obras sin tener `ver_todas` (el servidor no le manda las pendientes ajenas) y perdía su
«Pedir materiales» y «Recibir»; un prevencionista que solo recibe caía en lo de producción.
0. **Super Administrador** (rol 1: Marcos y Mauricio) → **`VistaSuperAdmin`** (diseño «Super Administrador» de la
   opción A del lienzo; circuito de tres pasos, sin «Despachada»: § Circuito de tres pasos, arriba). Va primero porque tiene `aprobar` y todo lo demás. Mismo
   criterio que el servidor (`super_admin: Number(user.rol_id) === 1`) y que `TransferenciasPanel` (`rol_id === 1`):
   `esSuperAdmin` de `perfil.ts`.
1. **Sin la pestaña «Solicitudes»** (`inventario.tab.transferencias`) → lo de producción (punto 5), tenga lo que tenga.
   Todos los enlaces de las vistas van a `/inventario?tab=transferencias&…` y, sin la pestaña, `Inventario.tsx` cae en
   la primera pestaña que sí tiene: ningún enlace llevaría a lo que dice.
2. **`ver_todas` + `aprobar`** → **`VistaLeonardo`** (Leonardo López: `aprobar` propio de la mig 131 + rol
   Administrador, que trae `ver_todas`). Es la bandeja de todas las obras, y sin `ver_todas` el servidor no manda las
   pendientes ajenas (alcance de arriba). Lógica en `leonardo.modelo.ts` (con test):
   - Bajo el circuito, la fila roja **«N diferencias sin aclarar»** (`circuito.diferencias.total`: solicitudes, como la
     tarjeta y la pestaña) que abre Inventario → Diferencias: él las resuelve (mig 131) y la tarjeta de arriba suma por
     aprobar + diferencias; sin ella, «Inventario 10» abría «6 esperan tu aprobación». Con diferencias el vacío dice
     «Nada por aprobar.» (sin «Todo al día»). Agregado al lienzo: confirmar con Marcos.
   - «Aprobada · **por recibir**» (no «aún sin salir»: la app no registra la salida). Marcos 2026-10-23: el mismo texto
    en las cuatro vistas (Leonardo, jefatura, obra y Super Admin). El pie dice «Ver todas en
     Inventario», sin cifra (Pendientes pagina de a 20). Cada etapa dice en su `aria-label` / `title` qué lista abre
     (Aprobada con alguna en tránsito → «Todas»; Recibidas = todos los meses). Circuito de tres pasos (2026-10-23).
   - **«Aprobar o rechazar» se resuelve ahí mismo (el dueño 2026-10-23: «te abra en el mismo lugar como un despliegue
     sobre ese pendiente para resolver enseguida y no me lleve hasta Inventario»).** Tocar la fila ya no navega: despliega
     DEBAJO de ella (acordeón, una abierta a la vez; `aria-expanded`, la flecha gira) el detalle REAL de Inventario de esa
     solicitud, a todo el ancho de la tarjeta (en el celular, una columna). `inventarioPerfil/ResolverSolicitud.tsx` es un
     envoltorio chico: carga la solicitud con `useTransferencias().fetchById` (GET `/:id`) y monta `TransferenciaDetail`
     tal cual («Revisar y aprobar» → `AprobarForm` con origen por ítem, stock, auto-completar y faltante; «Rechazar» con
     motivo; en «Solicitud de materiales», su modal), con los mismos callbacks que `TransferenciasPanel` (mismos avisos,
     mismas validaciones de permisos y SoD del hook; el servidor revalida). Inventario no cambió. Al salir bien: se cierra,
     queda el aviso de Inventario («Transferencia aprobada» / «rechazada»), al aprobar se abre el mismo resumen con
     WhatsApp (`ResumenAccionModal`, con la solicitud fresca) y se vuelven a pedir el detalle y la tarjeta de arriba
     (`onCambio` de las vistas → `reintentar` + `fetchResumenInv` de Dashboard): la fila sale. Si después de aprobar se
     elige «crear solicitud por el faltante», el Inicio se pide de nuevo al crearla. Arriba del despliegue: «Abrir en
     Inventario» (la ruta de abajo) y la X (en «Solicitud de materiales» la X es la del propio detalle). Lógica pura
     (`resuelveAqui`, `resumenTrasAccion`, `abiertaVigente`) en `leonardo.modelo.ts`, con test; otro test lee los
     archivos para que no se reescriba aprobar ni rechazar. Si la solicitud cambió mientras tanto, el detalle muestra lo
     que corresponde a su estado (como en Inventario).
   - **Propia (SoD)**: no se ofrece aprobar (nota apagada, como antes) y la fila abre la solicitud en Inventario.
   - El aviso «N diferencias sin aclarar» sigue llevando a Inventario → Diferencias.
   - «Abrir en Inventario» y las propias abren `estado=pendiente&id=N`: **necesita que `Inventario.tsx` lea `id`** (`trfNavIntent`), que llegó a
     develop con las fichas (1a232c02) y no está en producción. Va con esta vista al promoverla (lo cuida un test de
     `leonardo.modelo.test.ts`); sin eso el panel abre la primera de la lista, la más nueva.
3. **`ver_todas` + `diferencias_ver`** (sin `aprobar`) → **`VistaJefatura`** (Daphne Lazcano, mig 131): el circuito y
   las diferencias de todas las obras, que sin `ver_todas` no vendrían.
4. **Sin `ver_todas`, sin bodega asignada (`bodega_id` null) y con alguno de `solicitar`, `solicitud_materiales` o
   `recibir`** → **`VistaObra`**: jefes de obra y prevencionistas (los roles de terreno: solicitar + recibir, RUNBOOK §
   16.5). Va por aquí aunque tenga `aprobar` o `diferencias_ver` (un rol de obra hecho a mano): sin `ver_todas` no tiene
   la bandeja de todas y VistaObra no aprueba nada (no hay botones de aprobar). Un prevencionista que **solo recibe**
   también, sin «Pedir materiales». Sin `ver_todas` porque VistaObra es «lo tuyo»: con él, el servidor manda lo de
   todas las obras y se mostraría como si fuera suyo. Qué muestra: § «Vista de obra», abajo.
5. **Todos los demás** → lo de antes, sin pedir `/inicio/perfil` (`RespaldoInventario`: «Solicitudes» con los grupos de
   la tarjeta + «Alertas de inventario»). Aquí quedan los bodegueros (`bodega_id`: reciben en su bodega, no piden para
   una obra), los Administradores sin `aprobar` ni `diferencias_ver` (Paula, Rodrigo, Matías, Luis: ven todas las obras;
   el rol de la mig 126 no trae `solicitar`, y aunque lo tuvieran, por `ver_todas` no es la de obra), quien no tiene la
   pestaña y quien aprueba o ve diferencias sin `ver_todas` y además con bodega o sin pedir ni recibir.

La obra asignada (`usuarios.obra_id`) no decide la vista: solo nombra la obra en los textos. La descripción bajo
«Inventario» cambia con la vista (textos del lienzo, `descripcionInventario`; la de jefatura nombra a quien aprueba
con `aprobadores`; la de obra, sin permiso de pedir, no invita a pedir: «Recibe lo que llega a Domeyko y revisa lo que
ya llegó.»). El campo `perfil` de la respuesta es una idea parecida del lado del servidor, pero el frontend **no lo lee**:
la vista la elige solo esta regla, con el rol y los permisos del token (el servidor no mira la pestaña ni `ver_todas`
para `perfil`). Las vistas reciben `{ datos }` (`PropsVistaInventario`) y comparten el formato de
`inventarioPerfil/formato.ts` (fechas, cantidades con su unidad, frases de ítems y diferencias, nombres, enlaces; con
test).

#### «Ver como» del Inicio — QUITADO (2026-10-26)

Existió del 22 al 26-10: una barra arriba del Inicio del Super Administrador para mirar el formato de las vistas de
los demás con sus propios datos. Marcos la sacó: su Inicio queda solo con su vista (sin el tablero de gerencia), y para
revisar la experiencia de otra persona se usa **Soporte · usuarios** («Ver como esta persona», con los datos y permisos
reales de esa persona, en solo lectura: seguridad-rbac.md § Ver como usuario (soporte)).

#### Vista del Super Administrador (`VistaSuperAdmin`, 2026-10-22)

Diseño «Super Administrador» de la opción A del lienzo: a Marcos y Mauricio no les toca nada, ven lo que hace cada uno.
Lógica pura en `inventarioPerfil/superadmin.modelo.ts` (con test). Solo usa la respuesta de `/inicio/perfil`:
- **Circuito de todas las obras** con las cifras exactas de `circuito`: Pedida («esperan a Leonardo», con el nombre de
  `aprobadores`; sin uno o dos, «por aprobar»), Aprobada («por recibir», con las en tránsito sumadas; sin
  «Despachada» desde 2026-10-23) y Recibida (este mes; «y N de antes» = las de meses
  anteriores que trae la lista y salen en la pestaña «Recibidas»). Las diferencias van aparte y **cuentan solicitudes**
  (`circuito.diferencias.total`), como la tarjeta, la pestaña Diferencias, VistaLeonardo y VistaJefatura; si son más
  ítems, la bajada lo dice («… en 3 ítems»). Cada etapa baja a su pestaña de la secuencia. Con una obra elegida en el
  selector de arriba, una nota chica dice que este detalle no se filtra (como VistaJefatura).
- **Quién tiene qué** (tres cajas, en una fila desde 768 px; sin caja «Bodega» desde 2026-10-23): quien aprueba (nombre
  de `aprobadores`; sin nombre, «Quien aprueba»), con «En octubre aprobó
  N y no aprobó M» (solo lo suyo, por id: lo que aprobó el Super Administrador no se le cuenta) y «Además, N diferencias
  por resolver» (solicitudes); **Obras** (solo lo que va a una obra: «aprobadas por recibir · la más antigua, N días»,
  con las en tránsito sumadas; cuántas pidieron y recibieron este mes. A las cifras exactas se les resta lo de la lista
  que va a una bodega: una devolución la recibe la bodega, y no cuenta en ninguna caja: está en la secuencia. Ya no hay
  «por enviar desde una obra»: lo que sale de una obra lo recibe igual su destino, y un traslado obra → obra cuenta
  una vez, en la obra que lo recibe); **Jefatura** (solicitudes con
  diferencias por investigar, con cuántas tienen faltantes y sobrantes). La respuesta no dice quién tiene
  `diferencias_ver`: va el rótulo «Jefatura», no «Daphne». Sus WhatsApp no quedan guardados. Si dos nombres de una misma
  frase comparten el primero, van completos («Juan Pérez o Juan Soto»).
- **Lo último que pasó**: una fila por cosa registrada (pidió, aprobó, no aprobó con su motivo, recibió una
  parte, recibió, con la diferencia en la misma fila; sin «despachó» desde 2026-10-23), agrupadas por día («Hoy · jue 22 oct»), lo más nuevo arriba. Sin
  nombre registrado, la frase va impersonal («Se recibió en…»). Una devolución o un traslado se nombra como tal («pidió
  devolver a Bodega Cerrillos desde Domeyko», «aprobó el traslado de Domeyko a Gorbea 3082»). Se dibujan 30 cerrada (el
  alto las corta) y hasta 150 abierta («Ver los N», con N a lo más 150: en el computador se desliza por dentro); lo
  anterior, en Inventario.
- **Secuencia completa · cada solicitud** (desde 2026-10-23 vive en `inventarioPerfil/SecuenciaCompleta.tsx`, con su
  estado en `useSecuencia.ts` y su lógica en `modeloSecuencia` / `modeloSuperAdmin`, porque también va en VistaJefatura;
  aquí se ve igual, con los mismos ids), en cinco pasos que no se pisan: Por aprobar, Aprobadas · por recibir (también
  las en tránsito y con recepción parcial: sin grupo «En camino» desde 2026-10-23), Recibidas con diferencia, Recibidas ·
  llegaron completas y No aprobadas. Pestañas Todas · Por aprobar · Aprobadas · Recibidas · No aprobada. Cada fila:
  Pidió → Aprobó → Recibió → (con diferencia pendiente) resolverla, con quién y cuándo, y «Ahora: … · a quién le toca»
  (cuatro casillas; sin «Despachó» ni «Despachar»). Aprobar le toca a quien aprueba. De dónde sale va bajo «Aprobó»
  («sale de Bodega Cerrillos»; recibida, «salió de …»). Una aprobada o en tránsito: «Ahora: recibir · quien pidió»
  (con una parte recibida, «recibir lo que falta · llegó una parte el 19 oct»); **una devolución o lo que va a una
  bodega lo recibe esa bodega** (con su responsable) **y un traslado, la obra de destino** («lo confirma quien recibe
  en el destino»); la fila se titula «Domeyko → Bodega Cerrillos» y dice «Devolución» / «Traslado». Una diferencia la
  resuelve quien aprueba y jefatura la investiga. Un paso que la app no registró va en gris: «Pidió · sin datos aquí».
  Una no aprobada que había sido aprobada antes muestra «Aprobó · sin fecha» (la app guarda quién; el rechazo pisa la
  fecha); la no aprobada cierra «Cerrada · Sin aprobar» (antes «No pasó a bodega»). En «Todas» se ven 2
  por paso (1 en el celular); en una pestaña o desplegada, hasta 50 por paso y el resto en Inventario.
  - **Cómo llegó** (solo lo que la app registra): con diferencia pendiente, esa (roja o ámbar). Un ítem del **catálogo**
    que llegó distinto y ya no está en `diferencias` → «Diferencia revisada» (solo si la lista vino completa; si no, o
    sin ella, «Llegó con diferencia»). Un ítem **fuera del catálogo** (personalizado) que llegó distinto → «Llegó
    distinto · Sin diferencia registrada»: `recibir()` solo anota diferencias de ítems del catálogo, así que nadie la
    revisó. Si de algún ítem no se sabe cuánto llegó (`recibida` null, o un personalizado en 0 con algo enviado: el
    contador de RecibirForm parte en 0, la misma regla de VistaObra) → «Recibida», sin «completa», y el paso se rotula
    «Recibidas · sin diferencia registrada». Si no, «Llegó completa».
  - Una solicitud con diferencia pendiente que no vino en `solicitudes` (recibida antes de las 10 últimas) se arma con
    lo que trae `diferencias` (sin quién pidió).
  - «Ver» abre la solicitud (`rutaSolicitud`); si tiene una diferencia por resolver, Inventario → Diferencias
    (`rutaDiferencia`). Si el servidor cortó alguna lista, un aviso lleva a Inventario: se compara cada etapa con su
    cifra exacta del circuito (los topes de `limites` son por etapa; las rechazadas del mes, que no tienen cifra exacta,
    cuentan al llegar a su tope), no la suma de las etapas.
  - **Disposición**: los cuatro pasos en columnas desde 768 px **y** si la lista mide 32rem o más (container query): con
    el menú lateral abierto, de 768 a ~850 px la tarjeta mide ~460 px y en columnas angostas no cabían las palabras;
    ahí va en vertical, como VistaJefatura pasa a su tira cuando la columna no da. Bajo 768 px, siempre en vertical.

#### Vista de obra (`VistaObra`, 2026-10-22)

Opción A del lienzo para jefes de obra y prevencionistas. Lógica pura en `inventarioPerfil/obra.modelo.ts` (con test).
Ven solo lo suyo (alcance sin `ver_todas`): todo lo que pidieron, vaya donde vaya.
- **Lo que llega a su obra y lo que no.** La mig 080 dio `devolucion` e `intra_obra` a quien tiene `solicitar` («Mover»),
  y `recibir()` no impide que quien pidió reciba. Por eso el Inicio separa:
  - **Llega** (`llegaASuObra`): el destino es una obra (la suya, `obra.id` del token; sin obra conocida, cualquiera) y
    no sale de ella. Solo esto va en «Tus aprobados · por recibir en Domeyko», con «Recibir», cuenta en la burbuja de
    «Recibir» y entra al «Historial de aprobados · Lo que ya llegó a tu obra».
  - **Sale** (`saleDeSuObra`): las devoluciones y lo que parte de su obra (un traslado a otra obra). Sin obra conocida,
    un traslado entre obras cuenta como que sale: no se le invita a recibir algo que quizás mandó él.
  - Lo aprobado o en camino que no llega (lo que sale y lo que pidió para otra obra) va aparte, en «Va a otro lugar»
    dentro del mismo bloque, sin «Recibir»: «Devolución a Bodega Cerrillos · aprobó Leonardo el 19 oct», «Traslado a
    Gorbea 3082 · salió el 21 oct», «Para Gorbea 3082 · …». Cada fila solo abre la solicitud. Lo pedido que espera
    aprobación sigue en «Esperando a Leonardo», con adónde va si no es su obra. Lo que no llega y ya se recibió no sale
    en el Inicio.
- **Circuito** (tres pasos desde 2026-10-23: Pedida → Aprobada → Recibida, sin «Despachada»; las en tránsito cuentan
  en «Aprobada»): las cifras son las del servidor, que cuenta TODAS sus solicitudes. Por eso «· Domeyko» en el título y
  la nota «Marcado: lo que va a tu obra» salen solo si todo lo que está en el circuito
  (en curso y recibido este mes) va a su obra. Si no, el título es «Tus solicitudes en el circuito» y la nota «Marcado:
  lo aprobado que falta recibir». Desviaciones del lienzo, conscientes:
  - «Aprobada · **por recibir**» y no «aún sin salir»: lo que se sabe es que nadie lo ha recibido.
  - Aprobada se marca (azul, anillo) solo si tiene alguna; sin nada marcado no hay nota.
- **Filas por recibir en camino** (`en_transito` / `recepcion_parcial`): píldora «En camino» (o «Llegó una parte») y
  «Salió de Paraguay el 21 oct», el origen y la fecha si se registró (sin fecha, quién aprobó). Nunca «despachó X».
- **Topes** (las cifras y la burbuja cuentan todas): 5 por recibir, 3 que van a otro lugar, 4 esperando, 2 no aprobadas y
  3 del historial. Pasado el tope, «Ver las N en Inventario» abre su filtro: aprobadas (o «Todas» si alguna va en
  camino), «Todas», pendientes y «Todas». El historial lleva siempre «Ver todo tu historial».
- **Píldora del historial**: sale de lo que la app registra como diferencia, que es lo mismo que cuenta el aviso «N
  diferencias sin aclarar» (`transferencia_discrepancias`, solo ítems del catálogo):
  - rojo («Faltaron 2 sacos») si un ítem del **catálogo** llegó distinto;
  - «Llegó completa» si todos los ítems tienen anotado lo que llegó y calza;
  - si no, ninguna píldora. Un personalizado sin anotar no es «faltó todo»: `RecibirForm` parte su contador en 0 y,
    antes del 2026-06-15 (e91e4910), ni se guardaba.
- **Varios orígenes**: «sale de Bodega Cerrillos y 1 lugar más», «Salió de Paraguay y 1 lugar más, el 21 oct», «desde
  … y N lugares más» (`origenes_extra`).
- **Sin `inventario.transferencias.recibir`**: el botón grande dice «Lo que llega» y va neutro (sin verde de acción), la
  nota dice «Quien recibe en obra confirma lo que llegó» y cada fila dice «Ver».
- **Sin permiso de pedir** (`puede.solicitar` false: ni `solicitar` ni `solicitud_materiales`; p. ej. un prevencionista
  que solo recibe): **no hay «Pedir materiales»** (`botonesGrandes` de `obra.modelo.ts`, con test) y «Recibir» va solo,
  a todo el ancho y en una fila también en el celular. Se quita en vez de dejarlo neutro (como «Lo que llega»): ese
  sigue mostrando lo que viene a su obra, mientras que «Pedir» abriría Inventario sin el asistente (`TransferenciasPanel`
  lo abre solo con permiso de pedir). La descripción bajo «Inventario» tampoco lo invita a pedir.
- **Nunca aprueba**: aunque quien mira tenga `aprobar` (un rol de obra hecho a mano, punto 4 de arriba), la vista no
  tiene botones de aprobar ni lee `puede.aprobar` / `puede_aprobar`; lo pendiente va en «Esperando a…» y cada fila solo
  abre la solicitud (aprobar se hace en Inventario). Lo cuida un test de `obra.modelo.test.ts` que lee `VistaObra.tsx`.
- **«Recibir»**: con una por recibir, abre esa; con varias, baja a la lista; sin nada en camino, abre las recibidas (las
  aprobadas estarían vacías).
- **Aviso de diferencias**: con una sola solicitud con diferencias, abre esa (`estado=recibida&id=N`). Con varias, dice
  «… en N solicitudes» y abre sus recibidas: desde el Inicio no se alcanzarían las otras.
- Pendiente de decidir con Marcos antes de producción: la tarjeta de arriba (de Mauricio, `resumenInicio.por_recibir`)
  cuenta solo `en_transito` y `recepcion_parcial`, y la burbuja de «Recibir» cuenta además las aprobadas que llegan a su
  obra. Sin «Despachar», casi todo está `aprobada`, así que la tarjeta puede decir 0 mientras el detalle dice «3
  llegan».

#### Vista de jefatura (`VistaJefatura`, 2026-10-22)

Opción B «El circuito» del lienzo para quien ve diferencias sin aprobar (Daphne). Lógica pura en
`inventarioPerfil/jefatura.modelo.ts` (con test). Daphne no aprueba ni resuelve: no hay botones de aprobar ni de resolver.
- **Circuito** con las cifras exactas de `circuito`: Pedida → Aprobada → Recibida (este mes), pasos 1-3, y Diferencias
  aparte: cuatro cajas (sin «Despachada» desde 2026-10-23; «Aprobada · por recibir» suma las en tránsito y su panel las
  lista con las aprobadas, «N días sin recibir»). **Todas cuentan solicitudes**, también Diferencias (`circuito.diferencias.total`, lo mismo que la tarjeta del
  Inicio y la pestaña Inventario → Diferencias, que cuentan `COUNT(DISTINCT t.id)`). La lista de Diferencias va ítem por
  ítem: si no es uno por solicitud, la bajada lo dice («4 ítems en 3 solicitudes.») y el pie habla de ítems.
- **Alcance en el rótulo**: sale de `alcance` («todas las obras» con `ver_todas`; sin él, «tus solicitudes» o «tus
  solicitudes y tu bodega»), no fijo. El detalle **no se filtra** por la obra elegida en el selector de arriba: con una
  elegida, una nota chica lo dice.
- **Al entrar**, abiertas Pedida y Diferencias; tocar otra etapa muestra solo la suya. La etapa abierta se pinta (verde;
  roja en Diferencias) solo si tiene algo: con 0 queda blanca con un anillo y el panel trae solo el título («Nada espera
  aprobación») y su bajada.
- **Disposición** (regla de Marcos: lo de celular, solo bajo 768 px de pantalla): bajo 768 px, la tira de una línea, el
  chip «N diferencias» y Pedida **resumida** («Apurar a Leonardo» + «Ver las 6»). Desde 768 px, Pedida siempre completa;
  las cuatro cajas en tarjetas en línea (compactas bajo 860 px de columna; en una columna de menos de 600 px, p. ej. 800 px
  con el menú lateral abierto, en la tira porque no caben) y los dos paneles lado a lado desde 1000 px de columna.
- **Topes del Inicio**: 8 solicitudes y 5 diferencias a la vista (las más antiguas en lo que está en curso, las más
  nuevas en lo recibido), con «Se ven 8 de 240 · Ver 200 de 240» / «Ocultar». Si el servidor cortó la lista (`limites`),
  «Ver las 240 en Inventario» abre su filtro (en Aprobada con alguna en tránsito, sin cifra: abre «Todas»).
- **Pedida**: las filas no se tocan (como el lienzo: ella no actúa sobre cada una). «Apurar a Leonardo» abre WhatsApp con
  la lista (tope de 15 líneas). Una pendiente que pidió **el único que aprueba** no va en el mensaje (SoD: `aprobar()` se
  la bloquea) y su fila dice «La pidió Leonardo: solo la puede aprobar un Super Administrador.»; si no queda ninguna que
  apurar, no hay botón.
- **Aprobada y Recibida** abren la solicitud en Inventario (`rutaSolicitud`, «Ver ›»); cada diferencia abre
  Inventario → Diferencias en solo lectura (`rutaDiferencia`). En Recibida la píldora de cómo llegó es roja solo si la
  solicitud sigue con una diferencia pendiente (está en `diferencias`); ya aclarada, neutra «Llegó distinto». Si la lista
  de diferencias vino cortada, no se sabe y queda roja.
- **«Preguntar»** a quien aprobó o a quien recibió («Quién lo hizo» = Aprobó + Recibió desde 2026-10-23; nunca quien
  despachó): WhatsApp sin número con el mensaje listo; a quien recibió cierra «¿Me cuentas qué pasó?» y a quien aprobó,
  «¿La puedes revisar?».
- **Secuencia completa · cada solicitud** (el dueño 2026-10-23: «le interesa tener el detalle en lo que va cada
  solicitud»): DEBAJO de todo lo anterior, que no cambia, la misma sección de VistaSuperAdmin (`SecuenciaCompleta.tsx`
  con `modeloSecuencia`): pestañas Todas · Por aprobar · Aprobadas · Recibidas · No aprobadas, grupos por paso, cada fila
  Pidió → Aprobó → Recibió → «Ahora: … · a quién le toca» y «Ver las N». Ella no aprueba ni resuelve: «Ahora: aprobar ·
  Leonardo» le dice a quién apurar, y «Ver» abre la solicitud (o su diferencia, en solo lectura), como el resto de su
  vista. Lo cuida un test de `jefatura.modelo.test.ts` que lee los archivos.
- Pendiente de decidir con Marcos: la tarjeta de arriba (de Mauricio) dice «4 · por resolver» para Daphne
  (`por_aprobar` es null y solo suma diferencias); el lienzo aprobado decía «10 · pendientes y diferencias».

## Tarjeta «Inventario» del Inicio (`GET /api/transferencias/inicio`, 2026-10-20)

`transferenciaService.resumenInicio(user)` cuenta lo que le toca a quien mira, según su perfil; lo que
el perfil no puede hacer viene `null` y la tarjeta no lo muestra. Cada grupo trae `{ total, dias }`
(antigüedad de la más vieja). Excluye obras de prueba y finalizadas, como el resto del módulo.
- `por_aprobar` y `discrepancias` (`transferencias.aprobar`): globales, igual que `GET /pendientes` y la
  pestaña «Diferencias» (transferencias con diferencias `pendiente` y `diferencia <> 0`). `discrepancias`
  también viene con **`transferencias.diferencias_ver`** (mig 131, § Ver diferencias sin resolverlas): la misma
  consulta, sin `por_aprobar`.
- `por_despachar` (`despachar`, estado `aprobada`) y `por_recibir` (`recibir`, `en_transito` o
  `recepcion_parcial`): con el alcance del listado — sin `ver_todas`, las propias + las destinadas a su
  bodega (mig 097).
- `mis_solicitudes`: las propias en curso (pendiente, aprobada, en tránsito).
La ruta va ANTES de `/:id`. Cada fila abre Inventario → Solicitudes con su filtro:
`/inventario?tab=transferencias&estado=pendiente|aprobada|discrepancias|todas` (Inventario lee `tab`,
`estado`, `id` y `nuevo` solo al entrar, abajo). Lógica del frontend en `resumenInventarioInicio.ts` (con test).

### Enlaces del Inicio a Inventario (`/inventario?tab=transferencias&…`, 2026-10-22)

Inventario lee estos parámetros **solo al entrar** (`Inventario.tsx` → `TransferenciasPanel`). Los arman las filas de la
tarjeta y, en el detalle por perfil, `inventarioPerfil/formato.ts` (`rutaSolicitud`, `rutaDiferencia`, `rutaLista`,
`RUTA_PEDIR`):
- `estado=pendiente|aprobada|recibida|discrepancias|todas`: el filtro de la lista (sin permiso de ver diferencias,
  `discrepancias` cae en `todas`). En tránsito, recepción parcial y rechazadas se abren con `todas`.
- `id=N`: abre esa solicitud. Con `estado=discrepancias`, `TransferenciasPanel` la elige de la lista de diferencias
  pendientes que ya trae; si no está (la lista trae las 50 más nuevas), la busca una vez con `limit=200` y, si ya no está
  pendiente, avisa. Con otro estado la abre por `GET /:id` (con su regla de visibilidad).
- `nuevo=pedir`: abre el asistente «Pedir» (el botón «Pedir materiales» de la vista de obra). Solo con `solicitar` o
  `solicitud_materiales` y fuera de «Diferencias» / «Histórico» (sin permiso, no pasa nada). Se usa **una vez**: el
  panel avisa a Inventario y, si se vuelve a la pestaña Solicitudes, ya no se abre solo.
Desde el Inicio no se recibe ni se resuelven diferencias: piden formulario y validan todo al ejecutarse. Aprobar o
rechazar, sí, pero con el formulario REAL de Inventario desplegado bajo la fila de VistaLeonardo (2026-10-23, § «Qué vista
ve cada uno», punto 2), no con un botón suelto.
**Al subir a producción** (por SHA, lista de verificación): la lectura de `id` en `Inventario.tsx` (`trfNavIntent`) y la
apertura de la diferencia por id en `TransferenciasPanel.tsx` (`setSelectedDiscrepancia`) llegaron con 1a232c02 (las
«fichas», solo en develop) y las usan las vistas por perfil: sin ellas, tocar una solicitud abre solo el filtro (y en el
computador se elige la PRIMERA de la lista, otra solicitud) y una diferencia abre la lista, no esa. Van en el paquete
aunque se quiten las fichas. Revisar antes de empujar: `git diff origin/main -- frontend/src/pages/Inventario.tsx
frontend/src/components/inventario/TransferenciasPanel.tsx`.

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
Implementación: `transferenciaService.resolverDiscrepancia`. Permiso: `inventario.transferencias.aprobar`
(`diferencias_ver` NO lo abre: 403). Lo usa quien lleva el inventario: el receptor no puede corregir su recepción
después. Desde la mig 131, en el rol Administrador solo Leonardo López tiene `aprobar` (seguridad-rbac.md).

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

### Ver diferencias sin resolverlas (`inventario.transferencias.diferencias_ver`, mig 131)

Decisión del dueño 2026-10-22: alguien de jefatura puede **mirar e investigar** las diferencias sin poder
resolverlas. Por ahora solo Daphne Lazcano, como permiso propio. Patrón OR **solo en lo de VER**:

| Qué | Permiso |
|---|---|
| `GET /discrepancias` (lista, con stock actual de origen y destino) | `aprobar` **o** `diferencias_ver` |
| Filtro «Diferencias» de Inventario → Solicitudes y su contador | `aprobar` **o** `diferencias_ver` (`canVerDiscrepancias` de `TransferenciasPanel`) |
| Inicio por perfil: lista `diferencias` de `inicioPerfil` | `aprobar` **o** `diferencias_ver` (sin ellos viene `null`; el conteo del circuito sí viene para todos, con su alcance) |
| Detalle `DiscrepanciaDetail` | con `diferencias_ver` en **solo lectura** (`canEdit` = `aprobar`): sin Resolver ni Descartar, dice «Sin permiso para resolver» |
| Inicio: grupo `discrepancias` de `resumenInicio` (la cifra de la tarjeta) | `aprobar` **o** `diferencias_ver` |
| Resolver (también `?simular=1`), rehacer, foto | solo `aprobar` (rehacer además rol 1) |
| Borrar una diferencia | solo `eliminar` |

No cambia la visibilidad de las solicitudes (`GET /:id` sigue con `ver_todas` / propias / su bodega): el detalle
de la diferencia trae todo lo que muestra desde `GET /discrepancias`.

### Lectura y borrado

- `GET /discrepancias` (permiso `aprobar` o `diferencias_ver`) devuelve, por fila:
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
