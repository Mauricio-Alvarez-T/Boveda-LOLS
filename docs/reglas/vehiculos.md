# Reglas — Vehículos

## Entidades por vehículo (migs 069-074)

- **Seguros** (`vehiculos_seguros`): tipo, compañía, póliza, monto, `fecha_inicio` →
  `fecha_vencimiento`.
- **Revisiones técnicas** (`vehiculos_revisiones`): tipo, resultado (aprobado/rechazado/otro),
  planta, `fecha` → `fecha_vencimiento`; `direccion` (mig 071) y `periodicidad` (mig 072).
- **Mantenciones** (`vehiculos_mantenciones`): tipo, taller, costo, km_al_realizar,
  `fecha_proxima` opcional.
- **Permisos de circulación** (`vehiculos_permisos_circulacion`, mig 074): emisión/vencimiento.
- **Documentos** (`vehiculo_documentos`, mig 077 + **100**): archivo (PDF/imagen) por categoría
  (permiso de circulación, seguro contra terceros, primera inscripción, póliza) + `fecha`,
  `fecha_vencimiento` y `observaciones`. ⚠️ Los tres son **OPCIONALES**: lo único obligatorio es el
  archivo — hay documentos que no vencen (el padrón) y los ya cargados no tienen esos datos. **No
  llevan alerta por email** (no existen `dias_alerta`/`email_alerta` en la tabla): su aviso es el
  contador in-app. Editar un documento cambia solo esos datos; para reemplazar el archivo hay que
  borrarlo y subirlo de nuevo.
- **Adjunto en revisiones y mantenciones** (mig 102): `nombre_archivo` + `ruta_archivo` en
  `vehiculo_revisiones` y `vehiculo_mantenciones` — el certificado de la revisión o la boleta del
  taller quedan pegados al registro, no sueltos como documento aparte. **Opcional**. Se sube en una
  segunda llamada (`POST /vehiculos/:id/(revisiones|mantenciones)/:regId/archivo`, multipart) después
  de guardar el registro como JSON, para no convertir esos endpoints en form-data. La descarga va por
  `GET .../archivo` autenticado; **`ruta_archivo` nunca sale en el JSON** (helper `sinRuta`), igual
  que en documentos.
- Las **imágenes se comprimen en el navegador** antes de subir (`utils/compressImage`, objetivo
  ≤ 500 KB) en TODOS los adjuntos del módulo — documentos, revisiones y mantenciones. Los PDF suben
  tal cual. Tope duro de 10 MB en multer.
- Validación de campos obligatorios en formularios de Permiso y Mantención.

## Estados de vencimiento (UI)

Lógica en `frontend/src/utils/vencimientos.ts` (pura y testeada), chip en
`components/vehiculos/EstadoVencimiento.tsx`:
- **Venció hace Nd** (rojo/destructive): `dias_restantes < 0`.
- **Vence hoy / Vence en Nd** (ámbar): `0 … 30` — **hoy cuenta como POR VENCER**, no como vencido.
- **Vigente** (verde): > 30 días. Sin fecha → no se pinta chip.
- ⚠️ Las fechas se parsean a mano (`parseFechaLocal`): `new Date('2026-08-24')` es medianoche **UTC**
  y en Chile cae el día anterior, corriendo todos los avisos un día.

## Leasing (migs 095 + 103)

- `es_leasing` + **fechas de contrato** `leasing_fecha_inicio` / `leasing_fecha_termino` (mig 103).
- **La sección de CUOTAS se retiró del formulario** (jefatura 2026-08-27, 2ª vuelta; antes ya se había
  quitado el toggle "Pagada"). La tabla `vehiculo_leasing_cuotas` conserva los datos históricos sin
  UI; el form ya NO envía `cuotas` (el backend solo las toca si vienen en el payload).
- **Término de leasing** (mig 104): checkbox `leasing_terminado` + campo `leasing_traspaso_a`
  ("Traspaso a:", visible solo con el check marcado). Un leasing terminado **deja de avisar** en el
  contador de vencimientos — ya fue gestionado. El traspaso solo persiste si terminado=1.
- El checkbox de seguro se llama **"Alerta de renovación de seguro"** (misma columna
  `avisar_alerta_seguro` de mig 103).
- **El fin del leasing entra al contador de vencimientos** (30 días antes, mismo umbral que todo):
  categoría `leasing`, subtipo `fin_leasing`, etiqueta "Fin de leasing". Pre-migración la consulta
  degrada a vacío (catch ER_BAD_FIELD_ERROR).
- `avisar_alerta_seguro` (mig 103, default 1): checkbox "Avisar alerta de seguro" en el form del
  vehículo. En 0, los seguros de ESE vehículo no cuentan en el aviso. Pre-migración el filtro cae a
  la consulta sin filtro (comportamiento previo).
- ⚠️ **Bug corregido 2026-08-27** ("el leasing no se guarda"): el modal de edición recibe la fila del
  LISTADO, que no trae cuotas (solo `getById` las trae) → el form abría vacío y al guardar PISABA
  las cuotas con `[]`. Fix: `VehiculoForm` se hidrata desde `GET /vehiculos/:id` al montar en modo
  edición. Regla: todo form de edición que maneje colecciones hijas debe hidratarse del DETALLE, no
  de la fila de la lista.
- `update()` de vehículos filtra la whitelist por columnas EXISTENTES (`existingCols`): se puede
  desplegar código de mig 103 antes de correrla sin romper el guardado.

## Contador de vencimientos en el menú (decisión usuario 2026-08-24)

- `GET /vehiculos/vencimientos?dias=30` (`vehiculos.service.getVencimientos`) junta **las 5 fuentes
  del vehículo**: documentos, revisiones, mantenciones, seguros y permisos de circulación. Devuelve
  `{ items, total, vencidos, por_vencer, dias }` ordenado por urgencia.
- ⚠️ **Las licencias de conducir NO entran** en este contador (el aviso es de los papeles del
  vehículo). Además `trabajadores.licencia_vencimiento` viene de una importación vieja y trae fechas
  `1899-11-30`: con licencias dentro, el badge marcaba **85** y el panel decía "venció hace 46.288
  días". Siguen disponibles en `getAlertas`/`getVencidas` (correo), que es donde se usaban.
- Piso `FECHA_MINIMA = '2000-01-01'` en las 5 consultas: cualquier vencimiento anterior es basura de
  importación, no un vencimiento real. Y se descartan filas con `dias_restantes` nulo — ojo que
  `Number(null)` es `0` y pasa un `isFinite`, con lo que se mostrarían como "Vence hoy".
- Cuenta **lo ya vencido + lo que vence dentro de 30 días**. Lo vencido NO sale del conteo hasta que
  se renueva: si saliera, dejaría de avisar justo cuando más importa.
- El Sidebar muestra `total` junto a "Vehículos" (rojo si `vencidos > 0`, ámbar si solo hay por
  vencer). El número es un **botón**: abre `VencimientosPanel` con el detalle, sin navegar. Menú
  colapsado → el número va sobre el ícono y no es clickeable.
- Hook `useVencimientosVehiculos`: fetch silencioso (un error deja el badge en 0, no toast), refresco
  cada 10 min, y no llama nada sin permiso `vehiculos.ver`.
- **El mismo número, desglosado en 3 niveles** (pedido 2026-08-24), todos con `VencimientosBadge` para
  que se lean como la misma cosa: menú → tarjeta de empresa → fila del vehículo. El desglose se calcula
  **en la página** agrupando `items` por `vehiculo_id` y mapeando a empresa con la lista de vehículos
  que ya tiene cargada — no hay endpoints de agregados. El badge del vehículo lleva en el tooltip QUÉ
  vence ("Revisión de gases: venció hace 16d").
- **Cuarto lugar donde aparece: la "Bandeja del día" del Inicio**, como **primer grupo y el único
  desplegado** al entrar (pedido 2026-08-24; orden: Vehículos → Asistencia → Documentos/Inventario).
  Cada fila es "PATENTE · Revisión de gases" + "venció hace 16d" y lleva a /vehiculos; rojo si venció,
  ámbar si está por vencer. El default vive en `GRUPO_ABIERTO_POR_DEFECTO` (`BandejaDelDia.tsx`) y la
  clave ausente en `collapsed` significa "usar el default", así que un grupo nuevo nace cerrado.
- `useVencimientosVehiculos` es un **store de módulo** (`useSyncExternalStore`), no estado por
  componente: hay 3 consumidores montados a la vez (menú, página, bandeja). Con un `useState` por hook
  eran 3 requests y 3 verdades distintas — al guardar un documento se actualizaba el contador de la
  página y el del menú quedaba viejo. Un solo intervalo de refresco para todos (refcount).
- `VehiculoDocumentos` recibe `onCambio` y la página le pasa `refetch`: al guardar o borrar un
  documento los contadores se actualizan solos, sin esperar el refresco de 10 minutos.

## Alertas por email

- Por registro: `dias_alerta` (default 30) + `email_alerta`; badge "Nd · Email" en la ficha.
- Script `backend/scripts/alertas_vehiculos.js`; cron cPanel diario `0 8 * * *`.
- Envía SOLO cuando `DATEDIFF(fecha, CURDATE()) = dias_alerta` (un único aviso, no spamea).
- Flags: `--forzar`, `--test` (dry run), `--dias N`.

## UI (patrón de referencia de la app)

- Vehículos es el **patrón master-detail canónico**: card único `rounded-3xl`, lista full-width con
  separadores y acento de selección, panel detalle 420px con Section/ItemRow/Empty, formularios en
  Modal, auto-selección del primer ítem en desktop. Las demás páginas convergen a este patrón
  (plan v2, Fases 3/5).
- Filtros: texto libre + dropdowns (patente/marca/modelo/tipo) generados de los datos.

## Permisos

- `vehiculos.ver / crear / editar / eliminar` + `vehiculos.configurar_alertas` (mig 073).
