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

## Registro vigente (duplicados cross-obra) — 2026-08-24

La UK es `(trabajador, obra, fecha)` → pueden existir 2+ filas del mismo día en obras
distintas (traslado TO+A intencional; duplicados históricos por re-guardar tras cambiar
la obra del trabajador o por períodos en otra obra).

- **Regla**: un trabajador tiene UN estado por día. La fila VIGENTE es la de `id` MÁS
  ALTO (la última registrada). Excepción: el par TO(origen)+A(destino) del traslado es
  legítimo — cada obra ve su propia fila en la vista POR OBRA; en scopes globales gana
  la más nueva (A destino).
- **Lectura**: `_filaVigente()` dedupea en `getByObraAndFecha('ALL')` y en `getReporte`
  sin obra (calendario del trabajador, lista diaria global, Excel global, WhatsApp).
  Con obra NO se dedupea. Alertas/dashboard/reporte semanal/quick-view usan guard SQL
  equivalente (`NOT EXISTS` fila más nueva en otra obra / `MAX(id)` por fecha).
- **Escritura**: `bulkCreate` y `crearPeriodo` eliminan en la misma transacción los
  duplicados MÁS ANTIGUOS del día en otras obras (`_limpiarDuplicadosCrossObra`);
  nunca borran filas TO ni filas más nuevas (re-guardar la obra origen tras un
  traslado no mata la fila real del destino).
- **Saneo histórico**: migración `101_dedupe_asistencias_cross_obra.sql` (conserva la
  más reciente, preserva pares TO; incluye SELECT de dimensionamiento comentado).
- Nota: en el Excel GLOBAL solo se ve la observación de la fila vigente — la
  observación "Traslado a: X" del TO aparece en el export POR OBRA origen.
- Las alertas Art. 160 atribuyen la falta a la obra DONDE OCURRIÓ (`a.obra_id`), no a
  la obra actual del trabajador (cambio 2026-08-24; antes `t.obra_id`).

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
- **SIN horas (jefatura 2026-08-17)**: el sábado solo registra asistió/no asistió +
  observación. Las columnas `horas_default`/`horas_trabajadas` quedan muertas en BD (sin
  migración); no hay inputs de horas ni aparecen en mensajes ni reportes. (La columna
  Excel "SÁB EXTRA (h)" ya se había eliminado en 671afc9, 2026-05-20.)
- Solo sábados (getDay=6), no pasado, máx 1 año adelante (`sabadosExtra.service.js`).
- Si coincide con feriado activo → 409; UI confirma con `acepta_feriado=true`.
- Concurrencia: `SELECT ... FOR UPDATE` en transiciones.
- No se permite citar para obra inactiva.
- 6 permisos granulares (ver/crear/editar/cancelar/registrar/enviar_whatsapp).
- **WhatsApp (citación y asistencia)**: la tarea de cada rubro va DEBAJO de su grupo
  (`_Tarea: …_` bajo el header del cargo, desde `observaciones_por_cargo`); la
  observación global se mantiene al final si existe. Builders en
  `frontend/src/components/attendance/sabados/sabadosWhatsApp.ts` (+ tests `.test.ts`).

## Excel de nómina — pago base 30 días (mes comercial)

Regla jefatura 2026-08-17: los pagos SIEMPRE se calculan base 30 — mes de 31 se trunca a
30, febrero (28/29) se redondea a 30. Implementado en `generarExcel`:

- **Grilla de 31 columnas de día** (antes 30). Días inexistentes del mes = "fantasma":
  header sin día de semana, fill gris estructural, jamás fechas del mes siguiente
  (bug corregido: `new Date(y, 1, 29)` desbordaba febrero al 1-2 de marzo).
- **Q1/Q2 aditivas** por `cuenta_dia_trabajado` + marcador FDS (sin cambio) sobre los
  días 1-15 y 16-30. **El día 31 SOLO descuenta**: Q2 = `MAX(0, aditivo − COUNTIF(celda 31,
  códigos no-pago))`. Códigos que descuentan el 31: los con `cuenta_dia_trabajado=0`
  (F/LM/PSG) más `'-'` (estado desconocido). El 31 asistido/FDS/vacío es NEUTRO
  (vacío no descuenta → exports históricos no cambian). Falta el 31 → Q1+Q2 = 29.
- **Relleno de meses cortos** (días 29/30 de febrero): pagan como FDS solo si el
  contrato cubre el último día real del mes Y ese día no quedó en código no-pago
  (LM 20→28-feb = 19 días, no 21 — la ausencia a fin de mes extiende su descuento).
- **Columnas DESCUENTOS Q1 / DESCUENTOS Q2** (tras cada conteo de quincena): detalle
  visible por código con día de semana (`F: lunes 07, miercoles 09`), días hábiles sin
  registro, rangos fuera de contrato y penalización del 31 — para que remuneraciones
  cuadre sin abrir notas.
- Horas extra del día 31 real SÍ suman a TOTAL HRS EXTRA.
- **Columna BALANCE HRS ORDINARIO ELIMINADA** (jefatura 2026-08-17: sin utilidad en el
  flujo de remuneraciones). Columnas finales: TOTAL DIAS TRABAJADOS, HRS DESCONTADAS (JI),
  TOTAL HRS EXTRA, OBSERVACIONES.
- Tests: `backend/tests/excel_export.test.js` (suite "Excel base 30").

## Horas extra

- `asistencias.horas_extra DECIMAL(4,2)`; gateado por permiso `asistencia.horas_extra.ver`.
- Sin permiso: inputs ocultos en UI y columna HE en blanco en Excel (estructura preservada).

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
