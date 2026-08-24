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
- Validación de campos obligatorios en formularios de Permiso y Mantención.

## Estados de vencimiento (UI)

Lógica en `frontend/src/utils/vencimientos.ts` (pura y testeada), chip en
`components/vehiculos/EstadoVencimiento.tsx`:
- **Venció hace Nd** (rojo/destructive): `dias_restantes < 0`.
- **Vence hoy / Vence en Nd** (ámbar): `0 … 30` — **hoy cuenta como POR VENCER**, no como vencido.
- **Vigente** (verde): > 30 días. Sin fecha → no se pinta chip.
- ⚠️ Las fechas se parsean a mano (`parseFechaLocal`): `new Date('2026-08-24')` es medianoche **UTC**
  y en Chile cae el día anterior, corriendo todos los avisos un día.

## Contador de vencimientos en el menú (decisión usuario 2026-08-24)

- `GET /vehiculos/vencimientos?dias=30` (`vehiculos.service.getVencimientos`) junta **las 6 fuentes**
  del módulo: documentos, revisiones, mantenciones, seguros, permisos de circulación y licencias de
  conducir. Devuelve `{ items, total, vencidos, por_vencer, dias }` ordenado por urgencia.
- Cuenta **lo ya vencido + lo que vence dentro de 30 días**. Lo vencido NO sale del conteo hasta que
  se renueva: si saliera, dejaría de avisar justo cuando más importa.
- El Sidebar muestra `total` junto a "Vehículos" (rojo si `vencidos > 0`, ámbar si solo hay por
  vencer). El número es un **botón**: abre `VencimientosPanel` con el detalle, sin navegar. Menú
  colapsado → el número va sobre el ícono y no es clickeable.
- Hook `useVencimientosVehiculos`: un solo fetch, silencioso (un error deja el badge en 0, no toast),
  refresco cada 10 min, y no llama nada sin permiso `vehiculos.ver`.

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
