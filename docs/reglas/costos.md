# Reglas — Presupuestos y costos de obra

Módulo creado el 2026-10-16 (mig `122_costos_obra.sql`) a pedido de **Rodrigo** (número dos de LOLS,
después de don Luis), para él, don Luis y el arquitecto. Hoy el presupuesto y las facturas de cada
obra se llevan a mano o de memoria ("le saco foto a la factura y la mando; lo demás lo ve la
secretaria"), y se pierden datos. **Es un ESQUELETO**: Marcos le pregunta a Rodrigo la semana del
19-10 qué anota hoy en su Excel; lo que diga ajusta los campos.

> **No confundir** con la mini-app de cotizaciones que pidió don Luis el 16-09 (sobre su Excel de
> cotización): esa es otra cosa, aparte.

## Quién entra

- Un solo permiso: **`costos.gestionar`** (ver, agregar, modificar y borrar). Sección
  Configuración › Sistema, marcado `sensible: 'financiero'`.
- Se asigna **por usuario** (override en `permisos_usuario_override`) a don Luis, Rodrigo y el
  arquitecto. El Super Administrador (Marcos, Mauricio) lo tiene por rol (mig 122 lo siembra en
  `permisos_rol_v2` para el rol 1). Como todo permiso, vive en el JWT: **hay que volver a entrar**
  después de asignarlo.
- Menú: **«Presupuestos»** (ícono calculadora), ruta `/costos`. Backend `/api/costos/*`, todo con
  `[auth, checkPermission('costos.gestionar')]` (`costos.routes.js`).
- Obras visibles: `es_prueba = 0` y (`activa = 1` o `finalizada = 1`).

## Presupuesto (itemizado chileno)

- Un presupuesto por obra (`costo_presupuestos.obra_id` UNIQUE), con partidas agrupadas por
  **capítulo** (`costo_partidas`: ítem, descripción, unidad, cantidad, precio unitario).
- Cuentas (`costos.service.js · calcularTotales`, la vista previa del modal de porcentajes repite la
  misma):

  | Línea | Cálculo |
  |---|---|
  | Costo directo (CD) | Σ cantidad × precio unitario (cada partida redondeada a peso) |
  | Gastos generales | CD × GG % |
  | Imprevistos | CD × imprevistos % |
  | **Costo presupuestado** | CD + GG + imprevistos ← **contra esto se compara lo gastado** |
  | Utilidad | costo presupuestado × utilidad % |
  | Neto | costo + utilidad |
  | IVA | neto × IVA % (19 por defecto) |
  | Total | neto + IVA |

- **Original vs modificación** (`origen`): lo importado o cargado al inicio es `original`; lo que se
  agrega después parte como `modificacion` con su **motivo** (obra extra, cambio del mandante). Así
  se ve cuánto creció la obra y por qué (Resumen › Desglose: «original» / «modificaciones»).
- **Importar desde Excel** (`excelPresupuesto.ts`): se lee **en el navegador** (el archivo no se
  sube) y se muestra lo entendido antes de guardar. Busca la fila de encabezados por nombre (Ítem,
  Descripción/Partida, Unidad, Cantidad, Precio unitario, Capítulo); sin columna de capítulo, una fila
  con texto y **sin** cantidad ni precio es el título del capítulo que sigue. Se saltan las filas de
  totales (Total, Subtotal, Costo directo, IVA, Utilidad…). Solo `.xlsx` (un `.xls` antiguo pide
  "Guardar como"). Hay plantilla descargable. Máx. 3.000 partidas por importación, un solo INSERT.
- **Agregar vs reemplazar**: reemplazar borra las partidas actuales y **se niega (409
  `COSTO_REEMPLAZO_CON_GASTOS`) si alguna tiene gastos asignados**: se perdería a qué partida iba cada
  factura. Todo en una transacción.
- Borrar una partida **no borra sus gastos**: quedan sin partida (`ON DELETE SET NULL`) y el
  historial dice cuántos.

## Gastos (facturas, boletas, guías)

- Con **la foto y el monto total ya se puede guardar** (reemplaza el "le saco foto y la mando"). Lo
  que falte queda **«por completar»**: sin proveedor, o sin partida **y** sin categoría
  (`porCompletar`, mismo criterio en SQL de `listarObras`).
- Foto o PDF: `upload-costos.js` → `backend/uploads/costos/<obraId>/`, máx. 10 MB, JPG/PNG/WEBP/PDF.
  En el navegador la foto se comprime a ~400 KB (legible para montos y folio; el servidor tiene poco
  espacio). Descarga **autenticada** (`GET /api/costos/gastos/:id/foto`), nunca un estático; la ruta
  en disco no sale en el JSON (`tiene_foto`). Si el gasto se rechaza, la foto recién subida se borra.
  Borrar el gasto borra su foto.
- **Lo gastado se mide en NETO**, como el presupuesto (`netoDeGasto` / `SQL_NETO`):
  - factura con neto → el neto (el IVA es crédito fiscal);
  - factura **sin** neto → **total ÷ 1,19, marcado «estimado»** (el Resumen lo avisa: con exentos o
    impuestos específicos, como el combustible, el real es distinto);
  - boleta, guía u otro → el total (ese IVA no se recupera).
- Imputación: a una **partida** (tiene que ser de la misma obra: 400 `COSTO_PARTIDA_AJENA`) o a una
  **categoría** (materiales, mano de obra, maquinaria, subcontrato, combustible, gastos generales,
  otro). Lo de «gastos generales» sin partida se compara contra el GG presupuestado; lo demás sin
  partida suma al total gastado pero a ningún capítulo («sin asignar», con aviso).
- Pago: `por_pagar` (con vencimiento opcional; vencida = vencimiento < hoy, en rojo) o `pagada`.
  Pagada sin fecha de pago = pagada **hoy**.
- Montos y números en formato chileno ("45.000", "1.234,5", "$ 89.900") (`num` del service,
  `aNumero` del front).

## Historial

- Cada alta, edición, borrado e importación queda en `costo_historial` con quién y cuándo. Las
  ediciones guardan **solo lo que cambió** como `{campo: [antes, después]}`; los DECIMAL y DATE de la
  BD se normalizan antes de comparar (si no, cada edición anotaría cambios que no hubo).
- Si el historial falla, la operación ya hecha **no** se cae: se registra en el log.
- Fechas `DATE` se devuelven como **AAAA-MM-DD local** (`ymd`), no con `toISOString` (que puede
  correr un día).

## Pendiente (preguntar a Rodrigo)

- ¿Qué columnas tiene hoy su Excel? ¿Trabajan algún presupuesto en **UF**? (hoy todo es CLP).
- **Estados de pago** al mandante (avance cobrado por EP, retenciones ~5–10 %, devolución) y
  **boletas de garantía** (fiel cumplimiento, anticipo, vencimientos): no están en el esqueleto.
- APU (análisis de precio unitario: materiales, mano de obra + leyes sociales, equipos) por partida.
- ¿La secretaria también carga gastos? (hoy el permiso es todo o nada).
