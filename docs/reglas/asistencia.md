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
| FJ | Falta justificada | ✗ | ✗ | Mig 118. **NO** entra a Art. 160 ni al conteo de faltas (filtran `codigo='F'`). No paga el día; si jefatura decide pagarla, se cambia `cuenta_dia_trabajado` y nada más. **Mismo rojo que F** (mig 119, jefatura 07-10: "la sigla ya hace la diferencia") |
| AT | Atraso (legacy) | ✓ | — | Absorbido por JI en UI/WhatsApp |
| JI | Jornada Incompleta | ✓ | ✓ | Media jornada cuenta día completo |
| LM | Licencia Médica | ✗ | ✗ | Paga ISAPRE/Mutual, no la empresa |
| V | Vacaciones | ✗ | ✓ | Legales, pagadas |
| PR/PSG | Permiso sin goce | ✗ | ✗ | |
| TO | Traslado de Obra | ✓ | ✓ | Día de viaje se paga |
| NAC | Nacimiento | ✗ | ✓ | Legal pagada (mig 065) |
| DF | Defunción | ✗ | ✓ | Legal pagada (mig 065) |
| MT | Matrimonio | ✗ | ✓ | Legal pagada (mig 065) |

- En el WhatsApp diario se muestran fijos A/F/JI/TO/V/LM; AL/FJ/NAC/DF/MT/PSG y cualquier otro código solo si >0
  (2026-11-18: el AL —accidente laboral— no salía porque el conteo era una lista cerrada; ahora cuenta todo código)
  (`frontend/src/hooks/attendance/useAttendanceExport.ts`).

## Registro diario

- Único por `(trabajador_id, obra_id, fecha)` — UK en `asistencias` (mig 004/006).
- **Feriados** (`feriados.activo=1`) bloquean el registro masivo (`asistencia.service.js`, validación bulk).
- **Sincronizar feriados nacionales** (Configuración → Feriados, permiso `asistencia.feriado.gestionar`;
  `POST /api/feriados/sync {year}`, año actual o siguiente). Desde 2026-10-26 prueba fuentes en orden y usa
  la primera con una lista creíble (≥12 feriados del año, sin regionales): **Gobierno Digital**
  (`apis.digital.gob.cl`, hoy caída) → **boostr.cl** (gratis, sin llave; trae los adicionales por ley y los
  irrenunciables) → **tabla verificada** `backend/src/config/feriadosChile.js` → **Nager.Date** (último
  recurso, **parcial**: no conoce los adicionales chilenos —omitió el 17-09-2027 de la Ley 20.983— y la
  pantalla lo advierte). Guardar = agrega los que faltan y actualiza nombre/irrenunciable de los
  **nacionales**; un feriado de obra/patronal en la misma fecha se respeta; no borra nada. Elecciones y
  feriados por ley especial **no** vienen de ninguna fuente fija: se cargan a mano. **Cada año** conviene
  agregar el año siguiente a la tabla, contrastando dos fuentes (ante diferencias manda la ley).
- Bulk valida fines de semana (sáb/dom lanzan error) y futuro máximo 30 días (`MAX_DIAS_FUTURO`).
- **Día cerrado** (Marcos 2026-11-18: «que no tenga la opción de marcar la asistencia si ya pasó, que mejor lo vea
  Daphne»): la asistencia se marca **el mismo día** (hora de Chile; cierra a las 23:59, sin margen). Un día anterior
  solo lo marca, corrige, borra o traslada quien tiene **`asistencia.dias_pasados`** («Marcar días que ya pasaron»,
  mig 154: Super Administrador y RR.HH.; mig 159: también el Gerente, don Luis; cualquier día) o **`asistencia.dias_pasados_mes`** («Marcar días pasados del
  mes», mig 155: **jefes de obra** = rol «Supervisor de Obra», confirmado por Daphne el mismo 18-11: «que en obra
  pasen asistencia si se olvidaron cualquier día del mes»; solo días del **mes en curso**: un mes anterior ya cerró
  para la nómina y queda para RR.HH.). Ambos van aparte de los escalones de la matriz de Roles (marca «delicado»: no
  se regalan al subir de nivel); se dan o quitan en Configuración. El servidor lo hace cumplir en `/bulk`,
  `/batch`, `PUT /:id` (la fecha de esa fila), `/borrar-dia` y `/traslado-obra` (`middleware/diaCerrado.js`, 403
  `codigo: 'DIA_CERRADO'` con el día). Los **períodos** (licencias, vacaciones) no cambian: se siguen ingresando hacia
  atrás. En pantalla (`AttendanceDailyTab`, `utils/fechaChile.diaCerradoPara`): si no puede, el día se ve con «Este
  día ya cerró… avísele a RR.HH.» (o «Es de un mes que ya cerró…» para el jefe de obra), los estados y campos
  bloqueados y sin Guardar/Repetir/Borrar (el calendario y el detalle se pueden abrir para ver); si puede, «{obra} no
  pasó la lista este día… puede pasarla ahora» (al jefe: «hasta el último día del mes») o «Día que ya pasó», y queda
  a su nombre (`registrado_por`). En el Inicio, «Pasar la lista» de la ficha sale solo si puede marcar el día más
  reciente sin lista. La campana y el aviso «Importante» siguen siendo solo de `asistencia.dias_pasados`.
- **Quién recibe el aviso «Importante»** (Marcos 2026-11-26: «Paula, Matías, Daphne y don Luis son los que usan el
  sistema»; él y Mauricio lo ven por control): quien tiene `asistencia.dias_pasados` = RR.HH. (Paula, Matías,
  Daphne), Gerente (don Luis, mig 159) y Super Administrador (Marcos, Mauricio). Al celular a las 8:00 solo llega a
  quien está en el horario de avisos (`avisosPendientes.HORARIO`): RR.HH. y don Luis, no los Super Administrador.
- **Recordatorio de listas olvidadas** (Marcos 2026-11-19: «a los supervisores tendría que aparecer un cartelito en
  asistencia que diga te olvidaste ayer o X días de pasar lista… y cuando lo tome desaparece»): arriba del registro
  diario de la obra elegida (`attendance/RecordatorioListaOlvidada.tsx` + `recordatorioLista.ts`), cartel ámbar «Se
  le olvidó pasar la lista de ayer» / «… en N días de este mes» con un botón por día (abre ese día; 5 a la vista, el
  resto al desplegar). Solo los días que **todavía puede pasar** (los del mes en curso); los de un mes anterior van en
  una línea aparte («ya cerraron: esos los pasa RR.HH.») y por sí solos no muestran el cartel. Cada día sale al
  guardarlo (vuelve a preguntar a `GET /dashboard/asistencia/sin-lista?obra_id=` con el evento de asistencia
  guardada) y cuando no queda ninguno el cartel se va. Lo ve quien tiene `asistencia.guardar` y NO
  `asistencia.dias_pasados` (RR.HH. tiene la campana). Mientras se está en uno de esos días no se muestra (ahí ya
  está «{obra} no pasó la lista este día»).
- **Ventana laboral = la UNIÓN de los períodos laborales** del trabajador (reingreso, mig 152 — ver
  `rrhh-trabajadores.md` § Reingreso y períodos laborales): antes del primer ingreso, después del finiquito
  vigente o **entre una baja y el reingreso** no se registra (400 desde 2026-11-17; antes salía 500), ni en
  bulk ni en períodos de ausencia (que tampoco pueden cruzar ese hueco); el Excel deja esas celdas en blanco
  y no pagan. Corregir días de un período anterior sigue permitido. Front y back usan
  `utils/periodosLaborales` (`fueraDePeriodo` / `motivoFuera`).
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

`getAlertasFaltas` es un filtro de **`getFaltasMes(obraId, mes, anio)`**, que devuelve a TODOS los
trabajadores con al menos una `F` en el mes (fechas, `total_faltas`, `obra_nombre` de su falta más
reciente y `alertas` vacío si no gatillan regla). La tarjeta **«Asistencia» del Inicio** (dueño
2026-10-20: "era un dato muy usado en versiones anteriores"; precisó que van SOLO los reiterados) usa
`/dashboard/summary` → `faltasMes = { reiterados, lista (200, más faltas arriba) }`: 3 filas en la
tarjeta (obra · faltas: días + chips de regla, rojo = 2 seguidos) y la lista completa con RUT en el
detalle; la fila abre Asistencia con `?q=RUT`. `trabajadoresConAlertas` (top 20) se mantiene.

Desde la tarjeta «Pulso del día» (2026-10-20) `/dashboard/summary` trae además **`ausentesHoy =
{ fecha, total, porEstado: [{ codigo, nombre, n }] (más numeroso primero), lista (tope 500) }`**: los no
presentes de hoy con la regla de fila vigente; `ausentesDetalle` conserva sus 20 de antes. **«Hoy» es el
día de Chile** (`utils/fechaChile.js`, `America/Santiago`): con `toISOString()` el Inicio preguntaba desde
las ~21:00 por el día siguiente; lo mismo vale para «ayer», el ranking de obras y el mes de las faltas.
**Obras sin guardar hoy** (`attendanceStatus`, tarjeta y detalle de Asistencia, pendientes del Inicio):
solo cuentan las obras que deben marcar — activas, no finalizadas ni de prueba, con
`participa_asistencia = 1` y **al menos un trabajador activo** (2026-10-20: antes una obra sin
trabajadores figuraba siempre como pendiente).

**Desde qué día pasa lista cada obra** (Marcos 2026-11-20, mig 156: BASCUÑAN 991 se creó hace más de un mes para
Inventario y hormigón, pero recién el lunes 16 se empezó a pasar asistencia, y el Inicio la mostraba en rojo desde
octubre). `obras.asistencia_desde` con `participa_asistencia = 1`:
- **vacía = «En preparación»**: la obra existe (Inventario, hormigón, herramientas) pero todavía no hay gente
  trabajando; **no avisa días sin lista**. Toda obra nueva parte así (formulario de obra).
- **con fecha = «Pasa lista desde»** ese día: desde ahí cuenta para obras sin lista, la campana y el recordatorio.
- **Se pone sola**: el día que se guarda la **primera lista** de una obra en preparación (`/bulk` y `/batch`,
  `asistencia.service._marcarInicioAsistencia`, después del commit; solo si está vacía — una fecha puesta a mano no
  se toca).
- **A mano** (`obras.editar`): chip «Asis» de Configuración → Obras («Asis · desde 16 nov», «Asis · preparando»,
  «Asis» atenuado si no participa) con tres opciones (En preparación · Pasa lista desde [fecha] · No pasa
  asistencia), el formulario de la obra y «Cambiar» bajo el calendario del Inicio.
- Migración: cada obra existente tomó el día de su **primera lista propia** (sin las filas de licencias/vacaciones);
  las que nunca guardaron una quedan en preparación.
- **Obra en preparación que ya tiene gente** (Marcos 2026-11-20, vista previa aprobada: «que pase un aviso si sigue
  en preparación… para el jefe que se haya olvidado o no sabe, y que a Daphne también le llegue»):
  `GET /api/dashboard/asistencia/en-preparacion?obra_id=` (`asistencia.ver`; `asistenciaSinLista.getEnPreparacion`)
  = obras activas, no finalizadas ni de prueba, participando, sin `asistencia_desde` y con trabajadores activos que ya
  ingresaron. Avisa en tres lugares, hasta que se guarda la primera lista o RR.HH. pone la fecha:
  - **Jefe de obra**, en Asistencia (`attendance/AvisoObraEnPreparacion`, ámbar, arriba del registro): «Esta obra
    todavía no pasa lista… si ya empezaron, guarde la lista de hoy». RR.HH. no lo ve.
  - **RR.HH.**, en la campana «Importante» (ámbar, junto a las obras sin lista): «Ya empezó…» abre las tres opciones
    con «Pasa lista desde» hoy; «Preguntarle» manda el WhatsApp.
  - **Celular**, en la ronda de las 8:00 (días hábiles, cada mañana mientras siga así): al jefe de esa obra
    (`asistencia.guardar` + `usuarios.obra_id`, etiqueta `aviso-preparacion`) y a RR.HH. (`asistencia.dias_pasados`,
    etiqueta `importante-preparacion`, importante).

**Obras que no pasaron la lista en días anteriores** (Marcos 2026-11-18: «al jefe de obra se le olvidó mandar; que
Daphne lo vea en la tarjeta y al entrar al otro día»). **`GET /api/dashboard/asistencia/sin-lista?obra_id=`**
(`asistencia.ver`; `asistenciaSinLista.service`): mira el **último mes** — los días hábiles de los **30 días
corridos anteriores** (lunes a viernes, sin feriados activos y **sin hoy**: hoy ya lo dice «Faltan …»; Marcos
2026-11-18: «me pidieron que guarde el último mes para controlar si algún día faltó pasar lista»; al principio eran
5 hábiles). Mismas obras que deben marcar (activas, no finalizadas
ni de prueba, `participa_asistencia = 1`) y además que **ya pasaban lista ese día** (`asistencia_desde`, ver abajo),
ya iniciadas (`fecha_inicio`) y con algún trabajador activo ingresado a esa fecha. «Pasó la lista» = el mismo criterio que «guardada hoy» (filas que no cubre un período activo,
o fila para toda la dotación). Por obra: los días sin lista con **qué pasó** (`nadie` o `solo_periodos`: solo
estaban las licencias o vacaciones), el **encargado** (`obras.encargado_nombre`) y **quién guardó la última lista**
antes de hoy (`asistencias.registrado_por`); también los días que **sí** guardó (`guardadas`, para el calendario).
Al guardar un día, ese día deja de contar (y la obra sale cuando no le queda ninguno). Se ve en tres lugares:
- **Tarjeta «Asistencia»**: una casilla a lo ancho bajo «Ausentes hoy / Faltas reiteradas», solo si hay alguna
  («1 · Obra no pasó la lista · ayer · DOMEYKO»), y la tarjeta pasa a **rojo** como con los reiterados. Pincharla
  abre el detalle (sin mover la pantalla, como las otras cifras).
- **Detalle**: primera sección, «Requiere acción · obras que no pasaron la lista», una ficha por obra
  (`ObrasSinLista`) con el **calendario del mes** de lunes a viernes (sin lista = rojo relleno; guardada = verde suave, Marcos 19-11;
  antes de empezar a pasar lista, feriado o no correspondía = borde punteado; hoy = borde; debajo «Pasa lista desde
  el lunes 16 de noviembre · Cambiar») y los días sin lista con qué pasó (los 3 más recientes;
  el resto al desplegar). Cada día sin lista —en el calendario o en la lista— abre Asistencia en esa obra y ese día
  (`/asistencia?fecha=YYYY-MM-DD` + la obra elegida arriba; la fecha solo se acepta si no es futura). «Pedir la
  lista» por WhatsApp (más de 3 días: agrupados por mes).
- **Campana «Importante»** (`layout/CampanaImportante.tsx`, junto al nombre; opción A del lienzo, Marcos
  2026-11-18: «que le llegue a su perfil importante si alguien se olvidó de pasar lista»): para quien tiene
  `asistencia.dias_pasados`, **solo si hay alguna obra** del último mes, roja con el número de obras. Al abrirla:
  cada obra con sus días y el encargado, «Pasar la lista» (el día más reciente) y «Pedir la lista»; «Ver el
  detalle» abre el del Inicio. **Se queda hasta que la lista se guarde**: vuelve a preguntar al cambiar de pantalla,
  al guardar la asistencia (evento `boveda-asistencia-guardada`) y cada 5 min. No sale en «Ver como». En el Inicio,
  «Pasar la lista» de las fichas también es solo para ese permiso (los demás pueden abrir el día para verlo).
- **Aviso «Importante» al celular** (`avisosPendientes.mensajeImportante`): en la ronda de la mañana (la hora del
  recordatorio, 8:00 por defecto), a quien del `HORARIO` tiene `asistencia.dias_pasados`, si alguna obra no pasó la
  lista **el último día hábil** (solo ese día: lo más viejo queda en la campana y el Inicio). Va **antes y aparte** del
  recordatorio (etiqueta `importante-sin-lista`): «Importante: una obra no pasó la lista — DOMEYKO no pasó la lista
  ayer, martes 17. Encargado: … Toque para pasarla o pedirla.» En el computador **no se va solo** de la pantalla
  (`requireInteraction`, `sw-avisos.js`).
- **Ventana al entrar** (`AvisoSinListaAlEntrar`, en MainLayout): solo lo **reciente**, los últimos **5 días
  hábiles** (`soloRecientes`; el mes completo queda en el Inicio, para no repetir cada día algo de hace semanas);
  **una vez al día** por persona (marca en
  `localStorage` con el día de Chile del servidor), solo a **RR.HH.** (`asistencia.ver` + `asistencia.dias_pasados`,
  desde la mig 154; antes `trabajadores.editar` o `documentos.laborales.emitir`), nunca en «Ver como». Si hay otra ventana abierta (documentos fuera de plazo,
  novedades), espera a que se cierre. «Ver el detalle» abre el detalle de Asistencia del Inicio.

**`GET /api/dashboard/asistencia?obra_id=`** (`asistencia.ver`; `inicioAsistencia.service`, fase 2 del
detalle del Inicio, se pide al abrirlo). Tres bloques, cada uno `null` sin su permiso o si falla:
- `proximos` — períodos activos (`asistencia.periodo.ver`) que **empiezan** en (hoy, hoy+14] o
  **terminan** en [hoy, hoy+14), con `vuelve = fin + 1` (el front lo corre al día hábil), y feriados
  activos de [hoy, hoy+14]. Trabajadores activos, sin prueba; con obra, la obra actual del trabajador.
- `descuentos` (`asistencia.exportar_excel`) — días del mes por trabajador en estados con
  `cuenta_dia_trabajado = 0` (F, LM, PSG…) y días JI aparte; fila vigente, sin prueba. **Referencia**:
  el cálculo oficial (base 30, relleno de febrero, horas JI) sigue siendo el Excel.
- `horasExtra` (`asistencia.horas_extra.ver`) — `SUM(horas_extra)` del mes por obra del registro.
- Fase 3 (`asistencia.ver`), días hábiles (lunes a viernes) con la fila vigente:
  - `tendencia` — 6 meses (el actual, parcial): `tasa` = no presentes **sin contar vacaciones (V)** /
    días registrados; `tasaFaltas` = solo F. Mes sin registros → `tasa: null` (no 0 %).
  - `faltasObra` — F del mes hasta hoy por obra del registro, con su tasa sobre los días de esa obra.
  - `patronFinde` — trabajadores activos con **2 o más F en viernes o lunes en los últimos 60 días**
    (ausentismo pegado al fin de semana que la regla de 2 días seguidos no ve). Es una alerta para
    conversar, **no** una causal del Art. 160.

## Lista de trabajadores en actividades sugeridas (`actividades_sugeridas`, mig 038/040/116)

Antes "Sábados extra". **Jefatura 2026-09-21: eliminar toda referencia a que los trabajos
extraordinarios sean "trabajos de los días sábados".** Renombrado completo (tablas, ruta API,
claves de permiso, archivos) en la migración 116.

- Qué es: una **lista** de trabajadores, por obra, asignados a actividades sugeridas; se envía
  por WhatsApp y luego se registra quién asistió. Aislada de la asistencia diaria.
- **Semana, no día.** La lista se asigna a una semana **lunes a viernes** identificada por su
  lunes en la columna `semana` (DATE). El selector del form ofrece 4 semanas: la pasada, la en
  curso (por defecto) y las 2 siguientes —el personal se pide como máximo dos semanas antes, dueño
  2026-10-21— (`utils/semanas.ts`: `opcionesSemanas`,
  `fmtSemana` → "Semana lun 21/09 – vie 25/09"). Fines de
  semana descartados. Las listas históricas (fechas de sábado) migraron al lunes de su semana.
- Validación (`actividadesSugeridas.service.js` → `validarSemana`): debe ser lunes; no anterior
  al lunes de la **semana pasada** (`SEMANAS_ATRAS = 1`, dueño 2026-10-21: muchos olvidan la lista
  y la arman el lunes siguiente a la actividad; la de hace dos semanas ya no) — 400 "Solo se puede
  armar la lista desde la semana pasada en adelante"; máx. 1 año.
  **Sin cruce con feriados** (una semana no "coincide" con un feriado).
- **Una lista ACTIVA por obra y semana** (UNIQUE `uniq_obra_semana_activa` sobre la columna
  generada `semana_activa` = `semana`, o NULL si está cancelada + `SELECT … FOR UPDATE`); 409 "Ya
  existe una lista para esta obra en esa semana" → la UI abre la existente (la activa).
  **Una lista cancelada libera la semana** (mig 135, dueño 2026-10-23: Héctor Herrera armó una
  lista con la semana equivocada y al cancelarla no podía armar la correcta). Si se canceló, no
  habrá actividad → se puede armar otra para esa obra y semana. La cancelada se conserva
  (historial; la lista muestra ambas con su estado), no se borra.
- Flujo/estados (ENUM interno intacto): `citada` (UI "Creada") → `realizada` (registro) →
  `cancelada` (soft-delete; detalle `cancelado`). Solo se edita en `citada`; la semana no se edita.
- **Eliminar definitivamente (mig 136, jefatura 2026-10-26).** Para listas armadas por error,
  en CUALQUIER estado (también `realizada`): `DELETE /:id/definitivo` borra la cabecera y sus
  trabajadores (`SELECT … FOR UPDATE`; detalle antes que cabecera) y la lista **deja de contar en
  el informe**. No se puede deshacer. Permiso propio `asistencia.actividades_sugeridas.eliminar`
  (crítico; solo Super Admin por defecto — distinto de `…cancelar`, que tiene terreno). El log
  global excluye la ruta; la ruta registra qué se borró (semana, obra, estado, trabajadores,
  asistieron). UI: botón "Eliminar" junto al estado en el detalle, con ventana de confirmación;
  en una `citada` sugiere "Cancelar lista" si solo no habrá actividad.
- **SIN horas (jefatura 2026-08-17)**: solo asistió/no asistió + observación. Columnas
  `horas_default`/`horas_trabajadas` muertas en BD.
- No se permite armar listas para obra inactiva ni con trabajadores finiquitados; 1..500.
- Permisos: `asistencia.actividades_sugeridas.{ver,crear,editar,cancelar,registrar,enviar_whatsapp}`
  (+ `informe` mig 117 y `eliminar` mig 136)
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
- **Justificativo adjunto (mig 118, 2026-10-06).** Un archivo por período (foto o PDF, JPG/PNG/WEBP,
  ≤10 MB) en `uploads/justificativos/<periodo_id>/`; columnas `justificativo_*` en
  `periodos_ausencia`. La **ruta nunca sale al JSON** (`getPeriodos` la quita y expone
  `tiene_justificativo`); se descarga por `GET /asistencias/periodos/:id/justificativo` (gate
  `asistencia.periodo.ver`). Subir/reemplazar y quitar: `POST`/`DELETE` misma ruta, gate
  `asistencia.periodo.crear` (quien asigna la falta adjunta su respaldo; sin permiso nuevo). Al
  reemplazar se borra el archivo anterior del disco; al cancelar el período el archivo se conserva
  (soft delete). El service acepta cualquier estado; **la UI ofrece el botón solo en FJ** (jefatura
  13-10-2026: fuera de la Falta a secas — no se pidió; si aparece el papel, se cambia el estado a FJ)
  (`WorkerCalendarModal`: "Tomar foto" abre la cámara con `capture`, "Subir archivo" acepta
  galería o PDF). **Vista previa antes de confirmar** (imagen directa; PDF embebido donde el
  navegador lo pinta, ficha donde no — `utils/archivos.ts`, compartido con vehículos); las fotos se
  **comprimen** al subir (`compressImage`, objetivo 500 KB, igual que vehículos). El adjunto viaja en
  una **segunda llamada** tras crear el período: si falla, el período queda igual y se avisa con
  `toast.warning`. Los períodos con adjunto muestran un clip en "Resumen de períodos activos" que abre
  el **visor en modal** (`JustificativoViewer` → `ui/VisorAdjunto`), no una pestaña: en el celular una
  pestaña con un blob PDF se vuelve descarga sin nombre. **El visor tiene zoom** (jefatura 07-10: ahí
  van recetas y certificados con letra chica): botones +/−/ajustar, rueda, doble clic/doble toque y
  pellizco (`touch-action: pan-x pan-y` para que el navegador no agrande la página entera); la vista
  previa antes de confirmar también se abre en grande tocando la imagen o el botón "Ver más grande".
  Tests: `backend/tests/asistencia_justificativo.test.js`.
- El WhatsApp diario enriquece las líneas de ausencia con el rango ("N días: ini → fin"); fallback
  "1 día: fecha" si el estado es de tipo período sin período registrado.

## Categoría de reporte

- `trabajadores.categoria_reporte` ∈ {obra, operaciones, rotativo} (mig 008): agrupa el WhatsApp
  diario y filtra reportes.

## Reporte WhatsApp diario

- Builder: `useAttendanceExport.ts → handleShareWhatsApp` (texto: totales, desglose por cargo y
  categoría, AUSENCIAS Y MOVIMIENTOS, aviso faltas reiteradas, saludo). Permiso
  `asistencia.enviar_whatsapp`. Emojis permitidos en WhatsApp (NO en UI de la app — ahí lucide).
