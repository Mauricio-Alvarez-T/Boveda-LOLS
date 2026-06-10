# Reglas — Vehículos

## Entidades por vehículo (migs 069-074)

- **Seguros** (`vehiculos_seguros`): tipo, compañía, póliza, monto, `fecha_inicio` →
  `fecha_vencimiento`.
- **Revisiones técnicas** (`vehiculos_revisiones`): tipo, resultado (aprobado/rechazado/otro),
  planta, `fecha` → `fecha_vencimiento`; `direccion` (mig 071) y `periodicidad` (mig 072).
- **Mantenciones** (`vehiculos_mantenciones`): tipo, taller, costo, km_al_realizar,
  `fecha_proxima` opcional.
- **Permisos de circulación** (`vehiculos_permisos_circulacion`, mig 074): emisión/vencimiento.
- Validación de campos obligatorios en formularios de Permiso y Mantención.

## Estados de vencimiento (UI)

`EstadoVencimiento` en `frontend/src/pages/Vehiculos.tsx`:
- **VENCIDO Nd** (rojo): fecha < hoy.
- **Vence en Nd** (ámbar): ≤ 30 días.
- **Vigente** (verde): > 30 días.
- *Sin {label}* (cursiva) si no hay fecha.

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
