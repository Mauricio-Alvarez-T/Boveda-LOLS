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

## Borrado correctivo (goma de borrar) — 2026-08-26

- **Botón goma** en la barra del Registro Diario (junto a Guardar): borra la asistencia
  GUARDADA de uno o varios trabajadores en la fecha visible. Nace del caso real: marcaron
  a los 194 trabajadores en el día equivocado y no existía deshacer.
- `POST /asistencias/borrar-dia` (`asistencia.service.borrarDia`): valida fecha/ids
  (tope 500), selecciona los ids exactos y borra por esos ids (race-safe). **Gate:
  `asistencia.guardar`** — quien puede guardar puede corregir; sin permiso nuevo
  (evita migración + re-login).
- **Alcance (v2, 2026-08-26 — caso TOESCA)**: la goma borra "el DÍA del trabajador".
  Con obra seleccionada: las filas de ESA obra (cualquier estado) MÁS las filas del
  mismo día en OTRAS obras cuyo estado no sea TO — bajo la regla "fila vigente" esas
  filas ajenas son duplicados/errores por definición (caso real: se marcó el 27-ago
  antes de un traslado; la fila vieja era invisible en la vista de la obra nueva y
  el Excel global la seguía pintando, mientras el Excel por obra salía vacío). El TO
  de origen (par TO+A) SE PRESERVA y `traslados_restantes` lo avisa. En Reporte
  Global: el día COMPLETO, TO+A incluidos.
- El DELETE es físico; `log_asistencia` cae por FK CASCADE. Queda **un log de
  auditoría** en `logs_actividad` (type DELETE) con fecha, obra, cuántos y la lista
  de trabajadores. El fallo del log jamás revierte el borrado.
- UI: el modal se alimenta de **`GET /asistencias/borrables?fecha&obra_id`**
  (`getBorrables`, mismo gate) — NO de la grilla, que deja invisibles: (1) miembros
  de la obra con la fila del día en otra obra, (2) FINIQUITADOS con filas (la vista
  filtra `t.activo=1` pero el Excel los pinta), (3) filas en obras finalizadas.
  El endpoint los incluye todos (solo `es_prueba=1` queda fuera) y detalla dónde
  vive cada fila; el modal muestra badges ("registro en X", "TO en X (se conserva)",
  "Finiquitado"). Selección explícita + "Seleccionar todos" + confirm final.
- ⚠️ Si el día borrado está cubierto por un **período de ausencia** (V/LM), el período
  sigue vivo: al recargar, el día se rehidrata desde el período. Para eso está el
  eliminador de períodos, no la goma.
- Anti-regresión: `backend/tests/asistencia_borrar.test.js`.

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

## Lista de trabajadores en actividades sugeridas (`actividades_sugeridas`, mig 038/040/116)

Antes "Sábados extra". **Jefatura 2026-09-21: eliminar toda referencia a que los trabajos
extraordinarios sean "trabajos de los días sábados".** Renombrado completo (tablas, ruta API,
claves de permiso, archivos) en la migración 116.

- Qué es: una **lista** de trabajadores, por obra, asignados a actividades sugeridas; se envía
  por WhatsApp y luego se registra quién asistió. Aislada de la asistencia diaria.
- **Semana, no día.** La lista se asigna a una semana **lunes a viernes** identificada por su
  lunes en la columna `semana` (DATE). El selector del form ofrece semanas desde la en curso
  (`utils/semanas.ts`: `opcionesSemanas`, `fmtSemana` → "Semana lun 21/09 – vie 25/09"). Fines de
  semana descartados. Las listas históricas (fechas de sábado) migraron al lunes de su semana.
- Validación (`actividadesSugeridas.service.js` → `validarSemana`): debe ser lunes; no anterior
  al lunes de la semana en curso (el viernes aún se puede armar la de esa semana); máx. 1 año.
  **Sin cruce con feriados** (una semana no "coincide" con un feriado).
- **Una lista por obra y semana** (UNIQUE `uniq_obra_semana` + `SELECT … FOR UPDATE`); 409 "Ya
  existe una lista para esta obra en esa semana" → la UI abre la existente.
- Flujo/estados (ENUM interno intacto): `citada` (UI "Creada") → `realizada` (registro) →
  `cancelada` (soft-delete; detalle `cancelado`). Solo se edita en `citada`; la semana no se edita.
- **SIN horas (jefatura 2026-08-17)**: solo asistió/no asistió + observación. Columnas
  `horas_default`/`horas_trabajadas` muertas en BD.
- No se permite armar listas para obra inactiva ni con trabajadores finiquitados; 1..500.
- Permisos: `asistencia.actividades_sugeridas.{ver,crear,editar,cancelar,registrar,enviar_whatsapp}`
  (las claves `asistencia.sabados_extra.*` se repuntaron en la mig 116; **re-login general**
  vía `roles.version + 1`).
- **WhatsApp (lista y asistencia)**: cabecera `*Lista de trabajadores en actividades sugeridas*` +
  `Semana lun dd/mm – vie dd/mm — Obra X`; la actividad de cada rubro va DEBAJO de su grupo
  (`_Actividad: …_` desde `observaciones_por_cargo`); observación global al final; sin emojis.
  Builders puros en `frontend/src/components/attendance/actividades/actividadesWhatsApp.ts`
  (+ tests). UI: pestaña "Actividades" en Asistencia (`?tab=actividades&actividadId=`), botones
  "Nueva lista" / "Crear lista" / "Guardar asistencia" (los resalta el tutorial de Ayuda).
- Historial de actividad: las filas anteriores conservan `modulo='sabados-extra'`; el frontend
  las rotula "Actividades sugeridas" (`logNormalizer.ts`).
- **Informe de asistencia (mig 117, 2026-09-21).** Permiso propio
  `asistencia.actividades_sugeridas.informe` (Paula prepara pagos por cargo). Dos endpoints:
  `GET /resumen-semana?semana=` (gate `…ver`) devuelve `por_cargo`, totales y las semanas con
  asistencia; `GET /informe-excel?semana=` (gate `…informe`) entrega el Excel de **dos hojas**:
  "Por cargo" (todos los que asistieron agrupados por cargo) y "Por obra" (obra → cargo →
  trabajadores), columnas N°/apellidos/nombres/RUT/cargo/obra/observación, total por grupo y
  general. **Solo listas `realizada` y filas `asistio`**; excluye obras de prueba e **incluye**
  finalizadas (es historial de pago). Sin montos (pendiente). La semana por defecto es la última
  con asistencia; se elige con un selector. Se ve en **Inicio** (widget `ActividadesSemana`) y en
  **Gestiones** (botón "Informe actividades" → modal con el mismo bloque). Etiqueta de semana
  compartida en `backend/src/utils/semana.js` y `frontend/src/utils/semanas.ts`.

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
  **EXCEPCIÓN ingreso el 31 (jefatura 2026-08-27)**: si la `fecha_ingreso` del
  trabajador es EXACTAMENTE el día 31 del mes exportado, el 31 con código pagador
  (`cuenta_dia_trabajado=1`) SUMA 1 a Q2 — sin ella quedaba en 0 pese a haber
  trabajado (días 1-30 fuera de contrato). F el 31 sigue dando 0; ningún otro
  trabajador cambia. DESC Q2 lo explicita: `Dia 31 (ingreso el 31, A): suma 1`.
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
