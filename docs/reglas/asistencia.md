# Reglas — Asistencia

## Estados de asistencia (`estados_asistencia`, seed mig 006 + 065)

Cada estado tiene 2 flags con semántica DISTINTA:
- **`es_presente`**: ¿estuvo físicamente en obra? (afecta fiscalización, dashboard, alertas de faltas).
- **`cuenta_dia_trabajado`**: ¿cuenta como día trabajado para nómina? (SOLO lo usa el Excel resumen; mig 049).
- Regla clave: **el Excel suma por `cuenta_dia_trabajado`, no por `es_presente`** (mig `049_cuenta_dia_trabajado.sql`).

| Código | Nombre | es_presente | cuenta_dia | Notas |
|---|---|---|---|---|
| P/A* | Asiste | ✓ | ✓ | Presente normal |
| F | Falta | ✗ | ✗ | **Injustificada** — alimenta Art. 160 |
| AT | Atraso (legacy) | ✓ | — | Absorbido por JI en UI/WhatsApp |
| JI | Jornada Incompleta | ✓ | ✓ | Media jornada cuenta día completo |
| LM | Licencia Médica | ✗ | ✗ | Paga ISAPRE/Mutual, no la empresa |
| V | Vacaciones | ✗ | ✓ | Legales, pagadas |
| PR/PSG | Permiso sin goce | ✗ | ✗ | |
| TO | Traslado de Obra | ✓ | ✓ | Día de viaje se paga |
| NAC | Nacimiento | ✗ | ✓ | Legal pagada (mig 065) |
| DF | Defunción | ✗ | ✓ | Legal pagada (mig 065) |
| MT | Matrimonio | ✗ | ✓ | Legal pagada (mig 065) |

- En el WhatsApp diario se muestran fijos A/F/JI/TO/V/LM; NAC/DF/MT/PSG solo si >0
  (`frontend/src/hooks/attendance/useAttendanceExport.ts`).

## Registro diario

- Único por `(trabajador_id, obra_id, fecha)` — UK en `asistencias` (mig 004/006).
- **Feriados** (`feriados.activo=1`) bloquean el registro masivo (`asistencia.service.js`, validación bulk).
- Bulk valida fines de semana (sáb/dom lanzan error) y futuro máximo 30 días (`MAX_DIAS_FUTURO`).
- Modo "Reporte Global": sin obra seleccionada (`selectedObra=null`), consolidado de todas las obras.
- Obras con `participa_asistencia=0` no aparecen en el selector de obra en /asistencia
  (`ObraSelector.tsx` route-aware + guard en `AttendanceDailyTab.tsx`; mig 075).

## Faltas reiteradas (Art. 160 N°3 Código del Trabajo)

`asistencia.service.js → getAlertasFaltas(obraId, mes, anio)` evalúa 3 reglas sobre faltas `F` del
mes calendario (deduplicadas por día):
1. **2 días seguidos** de falta.
2. **2 lunes** con falta en el mes.
3. **3+ faltas** acumuladas en el mes.

Consumo: dashboard (top 20) y **aviso en el WhatsApp diario** ("⚠️ VERIFICAR ASISTENCIA" con las
fechas DD/MM/YYYY) vía `GET /asistencias/alertas/:obraId?mes&anio` (permiso `asistencia.ver`).

## Sábados extra (`sabados_extra`, mig 040+)

- Flujo: **citada → asistio/no_asistio** (registro) → cancelable (soft-delete `estado='cancelado'`).
- Solo sábados (getDay=6), no pasado, máx 1 año adelante (`sabadosExtra.service.js`).
- Si coincide con feriado activo → 409; UI confirma con `acepta_feriado=true`.
- Concurrencia: `SELECT ... FOR UPDATE` en transiciones.
- Excel: columna "SÁB EXTRA (h)" suma `horas_trabajadas` de `estado='asistio'` en citaciones no canceladas.
- No se permite citar para obra inactiva.
- 6 permisos granulares (ver/crear/editar/cancelar/registrar/enviar_whatsapp).

## Horas extra

- `asistencias.horas_extra DECIMAL(4,2)`; gateado por permiso `asistencia.horas_extra.ver`.
- Sin permiso: inputs ocultos en UI y columnas HE+Sábados en blanco en Excel (estructura preservada).

## Períodos de ausencia (`periodos_ausencia`, mig 012)

- Rango `fecha_inicio`–`fecha_fin` con estado asociado; pre-llenan la asistencia diaria.
- El WhatsApp diario enriquece las líneas de ausencia con el rango ("N días: ini → fin"); fallback
  "1 día: fecha" si el estado es de tipo período sin período registrado.

## Categoría de reporte

- `trabajadores.categoria_reporte` ∈ {obra, operaciones, rotativo} (mig 008): agrupa el WhatsApp
  diario y filtra reportes.

## Reporte WhatsApp diario

- Builder: `useAttendanceExport.ts → handleShareWhatsApp` (texto: totales, desglose por cargo y
  categoría, AUSENCIAS Y MOVIMIENTOS, aviso faltas reiteradas, saludo). Permiso
  `asistencia.enviar_whatsapp`. Emojis permitidos en WhatsApp (NO en UI de la app — ahí lucide).
