# Reglas — RRHH y Trabajadores

## Documentos

- `tipos_documento` define el catálogo (nombre, **obligatorio**, activo).
- Completitud por trabajador = docs subidos activos / tipos obligatorios activos
  (`fiscalizacion.service.js`).
- `documentos.fecha_vencimiento`: dashboard alerta vencidos hoy, por vencer 7 días y timeline 14
  días (`dashboard.service.js`); alerta crítica si hay vencidos.
- Los PDF se normalizan y se pueden exportar en ZIP por trabajador (caso de uso fundacional:
  fiscalizaciones — `docs/project-brief.md`).

## Empresas

- `empresas.razon_social`; badges UI por empresa: LOLS / MAUA / PROV / DED
  (`utils/empresaTag.ts`, badge en asistencia diaria y consultas).

## Fiscalización / Gestiones (UI; antes "Consultas" — URL y archivos conservan el nombre viejo)

- Búsqueda avanzada (`fiscalizacion.service.js`): por obra, empresa, cargo, categoría de reporte,
  completitud (100% / con faltantes), ausentes, **aniversarios de 10 meses**
  (`fecha_ingreso + 10m` cae en el mes objetivo; query sargable) y **rango de fecha de
  ingreso** (`fecha_ingreso_desde`/`fecha_ingreso_hasta`, inclusivos, extremos opcionales —
  "ingresos del período", 2026-08-24). El rango tiene control propio en el FilterPanel
  (2 inputs date) y la card del trabajador muestra la fecha de ingreso (oculta en xs).
- Excluye `es_prueba=1` por defecto (`?incluir_prueba=true` lo anula) y obras finalizadas.
- Exportación Excel con fichas y documentos por trabajador. Con el filtro de ingreso
  activo, el export manda los ids visibles (el Excel de asistencia no entiende ese filtro).
- La página Consultas es visible con `trabajadores.ver` **o** con cualquiera de los dos permisos
  de la ficha de ingreso digital (`trabajadores.solicitud.crear` / `.aprobar`, 2026-09-07). Quien
  solo puede solicitar (terreno) cae directo a la pestaña Solicitudes y la grilla de búsqueda no
  se consulta (`useConsultasData(filters, enabled=false)` — evita el 403 del endpoint avanzado).

## Constancias → Documentos laborales generados

- La **Carta de Amonestación** ya no se arma en el navegador: desde el plan Gestiones B2 (mig 110) la
  emite el servidor, queda en la ficha y exige permiso. Ver § Documentos laborales generados por Bóveda.
  El Acta de Consentimiento fue eliminada.

## Reporte semanal RRHH por email

- Script standalone `backend/scripts/reporte_semanal.js` (abre/cierra su propia conexión).
- Contenido: línea de resumen ejecutivo + 4 KPIs semanales (contrataciones, desvinculaciones,
  faltas F, aniversarios 10m) + **desglose por obra** (altas/bajas/faltas-días por obra, ordenado
  por faltas) + 3 tendencias mensuales; **HTML puro compatible Gmail/Outlook** (tablas, sin JS).
- Aniversarios solo el **primer lunes del mes**.
- Diagnóstico de envío (no manda correo): `npm run reporte-doctor` — chequea `MAIL_*` + SMTP
  (`verify`) + destinatarios. Ver `docs/RUNBOOK.md §4.1`.
- Destinatarios (precedencia): flag `--to` > tabla `reportes_suscriptores` (Slice B, UI en
  Settings) > env `REPORTE_TO` (CSV). Degrada con gracia si la tabla no existe.
- Cron: `0 8 * * 1` en **cPanel Cron Jobs** (NUNCA node-cron — Passenger duerme el proceso).
- Flags: `--dry` (preview HTML en tmp/), `--fecha YYYY-MM-DD`.
- Excluye trabajadores `es_prueba=1`.
- Permiso de gestión de suscriptores: `sistema.reportes.gestionar` (mig 067).

## Trabajadores

- `es_prueba` heredado de la obra (ver obras-bodegas.md).
- `categoria_reporte` ∈ {obra, operaciones, rotativo} (mig 008).
- Datos financieros del trabajador gateados por `trabajadores.financiero.ver/editar`.
- WorkerQuickView (ficha rápida): panel lateral desktop / bottom-sheet móvil.
- **Creación de trabajador — dos caminos** (desde 2026-09-07):
  1. **Directa**: Consultas → CREAR → "Trabajador" (`trabajadores.crear`) → `WorkerForm` →
     `POST /api/trabajadores` (CRUD genérico de `index.js`; `beforeCreate` hereda `es_prueba` de la
     obra). Empresa obligatoria en el form.
  2. **Ficha de ingreso digital**: terreno crea una *solicitud* (`trabajadores.solicitud.crear`) y
     la oficina la aprueba (`trabajadores.solicitud.aprobar`); el trabajador se crea en la
     aprobación, con la ficha tal como la dejó la oficina. Ver sección siguiente.
- **Datos personales de la ficha (mig 108, 2026-09-07)** — 8 columnas nuevas en `trabajadores`,
  todas `NULL` (opcionales): `fecha_nacimiento DATE`, `estado_civil VARCHAR(30)`,
  `direccion VARCHAR(255)`, `comuna VARCHAR(100)`, `afp VARCHAR(60)`, `salud VARCHAR(60)`,
  `nacionalidad VARCHAR(60)`, `cargas_familiares TINYINT UNSIGNED` (`telefono` ya existía).
  ⚠️ **Opcionales para EXISTIR como trabajador, obligatorios para EMITIR UN CONTRATO** (plan Gestiones
  B2b, 2026-09-11): la primera cláusula imprime `nacionalidad`, `estado_civil`, `fecha_nacimiento`,
  `direccion` y `comuna`, así que el contrato los exige. No es contradicción con la decisión del
  2026-09-07 de dejarlos opcionales en la ficha de ingreso: terreno sigue sin estar obligado a llenarlos.
  Están en `allowedFields` del CRUD (`index.js`) → se **editan en `WorkerForm`** (sección "Datos
  personales", controles compartidos `workers/DatosPersonalesFields.tsx`) y se **ven en
  `WorkerQuickView`** (bloque "Datos personales", solo los que tienen valor; el teléfono sigue en
  Contacto). Estado civil = select fijo (Soltero/a, Casado/a, Conviviente civil, Divorciado/a,
  Viudo/a); AFP y salud = texto libre (sin catálogo); cargas = entero 0-255. En los forms los
  vacíos son `''` y viajan a la API como `null` (`normalizarDatosPersonales` en
  `consultas/solicitudIngresoSchema.ts`); el backend también convierte `''` → `NULL`. La misma
  migración formaliza el drift `fecha_desvinculacion DATE NULL` (hasta entonces solo la creaba el
  bootstrap de `scripts/migrate.js`).
- **RUT duplicado = 409 limpio, nunca un borrado** (blindaje 2026-09-07, `crud.service.js create`).
  `trabajadores` tiene `UNIQUE(rut)`. Antes, ante `ER_DUP_ENTRY` el CRUD genérico intentaba
  "reciclar" la fila inactiva homónima y, como `trabajadores` no tiene `nombre`/`razon_social`,
  degeneraba en `DELETE FROM trabajadores WHERE activo = 0` (hard-delete de finiquitados). Ahora
  el reciclaje solo corre cuando hay campo de búsqueda (`nombre`/`razon_social` — catálogos como
  cargos o empresas); sin él el error sigue al `errorHandler` → **409 "El registro ya existe
  (dato duplicado)"**. Para recontratar a un finiquitado se **reactiva** el existente (desde 2026-09-11 con `PUT /:id/reactivar`, ver § Desvinculación con causal), no se crea
  otro. Detalle y diagnóstico en `docs/RUNBOOK.md § 6`.

## Solicitudes de ingreso (ficha digital) — 2026-09-07

La "ficha de ingreso" de papel (la llenaba a mano el supervisor/prevencionista en obra y la
transcribía un administrativo) se reemplaza por una **solicitud** en Bóveda con aprobación:
terreno la crea desde Consultas → oficina la revisa, corrige, asigna la empresa y la aprueba
(crea el trabajador) o la rechaza con motivo. Decisiones del dueño: campos = solo los marcados a
mano en la ficha; empresa la define la oficina; aviso de RUT duplicado solo texto (sin link);
rechazo con motivo obligatorio y visible al solicitante; **sin firma** de ningún tipo.

### Flujo

1. **Terreno** (`trabajadores.solicitud.crear`): Consultas → CREAR → **"Nuevo ingreso"**
   (`consultas/CreatePanel.tsx`) → modal "Nuevo ingreso · Ficha de solicitud"
   (`SolicitudIngresoForm.tsx`). RUT es el **primer campo** (formato en vivo + check anti-duplicado,
   ver abajo); luego los ○ obligatorios; después, **todo visible y plano** (sin barra colapsable,
   pedido de oficina 2026-09-08): datos personales, tallas, pago de remuneraciones y observaciones —
   todos opcionales; la oficina completa lo que falte. Catálogos: `/cargos?activo=true` y
   `/obras?activo=true&incluir_prueba=true`. **Sin empresa.** `POST /api/solicitudes-ingreso` →
   estado `pendiente` → toast "Solicitud enviada a administración".
2. **Aviso a oficina** = contador ámbar (no hay notificaciones in-app, precedente del repo):
   badge en el ítem **Consultas** del menú (`Sidebar.tsx`, `VencimientosBadge`, clic →
   `/consultas?tab=solicitudes`), botón **"Solicitudes"** con contador junto a CREAR en la página, y
   grupo **"Solicitudes de ingreso"** en la Bandeja del Día (severity `warning`). Los tres leen el
   mismo store `hooks/useSolicitudesIngreso.ts` (`useSyncExternalStore`, un fetch compartido,
   refresco cada 5 min, `GET /pendientes/count` **solo con `solicitud.aprobar`**; sin permiso
   `pendientes = 0`).
3. **Oficina** (`trabajadores.solicitud.aprobar`): Consultas → pestaña Solicitudes
   (`?tab=solicitudes`, `SolicitudesIngresoPanel.tsx`; filtros Pendientes/Aprobadas/Rechazadas/
   Todas, default Pendientes; fila = nombre, RUT, obra, cargo, fecha ingreso, solicitante, fecha
   solicitud, chip de estado) → clic → `RevisarSolicitudModal.tsx`: la ficha llega **precargada y
   editable** (todos los campos, incluido el RUT) + **Empresa obligatoria** + `categoria_reporte`
   (default `obra`) → **"Aprobar y crear trabajador"** (`PUT /:id/aprobar` con la ficha editada;
   toast "Trabajador creado: NOMBRE") o **"Rechazar"** (reutiliza `RechazarForm` de inventario;
   motivo obligatorio; `PUT /:id/rechazar {motivo}`). Al resolver: refetch del store + recarga de
   la lista + `performSearch` de la grilla si se creó el trabajador.
4. **Solicitante**: ve **solo sus** solicitudes (scoping en el service por `solicitante_id`) con el
   estado; la ficha se abre en solo lectura con quién la resolvió, cuándo y, si fue rechazada,
   el bloque "Motivo del rechazo". No hay re-apertura: para corregir se crea otra solicitud (el
   RUT de una rechazada puede volver a solicitarse; `rut` NO es UNIQUE en la tabla).

### Campos de la ficha

| Marca | Campos | Quién |
|---|---|---|
| ○ obligatorios | `rut`, `nombres`, `apellido_paterno`, `cargo_id`, `obra_id`, `fecha_ingreso` | Terreno |
| — opcionales | `apellido_materno`, `fecha_nacimiento`, `estado_civil`, `direccion`, `comuna`, `afp`, `salud`, `nacionalidad`, `telefono`, `cargas_familiares` (0-255), `observaciones` | Terreno (la oficina puede completarlos/corregirlos) |
| Tallas (mig 109) | `talla_calzado` (35-47), `talla_pantalon` (38-50), `talla_polera` (S/M/L/XL/XXL) | Terreno, opcionales |
| Pago (mig 109) | `cuenta_rut` (Sí/No → boolean), `banco`, `tipo_cuenta` (vista \| corriente), `numero_cuenta` (dígitos/letras/guiones, máx. 30) | Terreno, opcionales. **Cuenta RUT = Sí ⇒ el backend fija `banco=BancoEstado`, `tipo_cuenta=vista`, `numero_cuenta` = RUT sin DV**, ignorando lo que mande el cliente |
| Solo oficina | **`empresa_id` (obligatoria para crear el trabajador)**, `categoria_reporte` (obra / operaciones / rotativo, default `obra`) | Oficina, al aprobar |

Desde 2026-09-08 la ficha digital es **1:1 con la de papel** (antes se excluían tallas y cuenta;
oficina pidió integrarlas). Lo único que sigue fuera es la firma. Validación de forma en `backend/src/schemas/solicitudesIngreso.schema.js` (mini-DSL de
`validateBody`, `{ strip: true }`: toda clave no declarada se descarta — anti mass-assignment);
reglas de negocio en `services/solicitudIngreso.service.js` (`_normalizarFicha`: DV del RUT, trims,
`''` → `NULL`, `formatRut` antes de guardar). Los opcionales viajan como `null` cuando van vacíos.

**Catálogos de datos personales (2026-09-08).** `comuna`, `afp` y `salud` se llenan por dropdown en
los tres formularios (`DatosPersonalesFields`): comuna = **solo Región Metropolitana** (52, con
buscador), AFP = las 7 vigentes, salud = **FONASA + cada isapre**. Listas en
`frontend/src/config/catalogosPersonales.ts`. El backend **no** valida enum a propósito: una ficha o
trabajador guardado antes con texto libre se conserva y el select lo muestra como opción extra
(`toSelectOptions`) para no perderlo al re-guardar. Mismo criterio para **tallas** (`TALLAS_*`) y
**bancos** (`BANCOS_CHILE`, incluye "Otro"). El bloque de pago pregunta primero "¿Paga a cuenta
RUT?": con **Sí** no pide nada más (BancoEstado / vista / N° = RUT sin DV, derivados en el service);
con **No** despliega banco (select), tipo de cuenta (radio vista/corriente) y número.

**Aviso WhatsApp tras enviar (2026-09-08).** Al crear la solicitud, el modal pasa a una pantalla de
confirmación (resumen: trabajador, RUT, obra, cargo, fecha) con botón **"Enviar por WhatsApp"**:
mensaje puro (`solicitudIngresoWhatsApp.ts`) con nombre, obra, fecha de contratación
(dd-mm-aaaa) y solicitante; envío con `utils/whatsappShare.ts` (copia al portapapeles + abre
WhatsApp). Sin permiso adicional: quien puede solicitar puede avisar (no lleva datos sensibles).
Badge y lista se refrescan apenas el POST responde, aunque se cierre con la X.

### Estados

`pendiente` (default) → `aprobada` | `rechazada`. Ambos finales: aprobar o rechazar una solicitud
ya resuelta → **409** "La solicitud ya fue aprobada/rechazada" (guard dentro de la transacción,
`SELECT ... FOR UPDATE`). Colores (DS, color = significado): pendiente **ámbar**, aprobada
**verde**, rechazada **rojo** — dominio `solicitudIngresoEstado` en `utils/statusConfig.ts`.
Listado: pendientes primero, luego `fecha_solicitud DESC`.

### Permisos (mig 108 + `permisos.config.js`, módulo Trabajadores)

| Clave | Quién | Habilita |
|---|---|---|
| `trabajadores.solicitud.crear` | terreno (supervisores / prevencionistas) | `GET /check-rut/:rut`, `POST /`, `GET /` y `GET /:id` **solo las propias**; botón "Nuevo ingreso"; acceso a Consultas aunque no tenga `trabajadores.ver` |
| `trabajadores.solicitud.aprobar` | oficina (administración) | `GET /` y `GET /:id` de **todas**, `GET /pendientes/count` (badge), `PUT /:id/aprobar`, `PUT /:id/rechazar`; pestaña Solicitudes con revisión |

- `GET /` y `GET /:id` aceptan crear **o** aprobar (`checkPermission(CREAR, APROBAR)` = OR); el
  scoping propias/todas lo decide el service con `req.user.p` (403 si la solicitud es ajena y no
  tiene aprobar; 404 si no existe).
- **Sin SoD** solicitante ≠ aprobador: un administrativo puede crear y aprobar su propia solicitud
  (a diferencia de transferencias de inventario).
- Frontend: ambas claves mapeadas en `config/permisosHierarchy.ts` (configuracion / Trabajadores,
  verbos crear / editar). `aprobar` no es permiso sensible.
- La migración 108 inserta el catálogo (`INSERT IGNORE permisos_catalogo`, **antes** del rol por la
  FK) y se los da solo a Super Admin (rol 1). Los roles de terreno/oficina se asignan en
  Configuración → Roles y el usuario debe **re-login** (los permisos viven en el JWT).

### Anti-duplicado por RUT

- El RUT se valida **en vivo** (debounce 400 ms) contra `GET /api/solicitudes-ingreso/check-rut/:rut`
  (gate propio `solicitud.crear`: terreno no tiene `trabajadores.crear`, que es el gate del
  check-rut del módulo Trabajadores). Respuesta
  `{ existe_trabajador, trabajador: {id, nombre, activo} | null, solicitud_pendiente: {id} | null }`.
- Bloquea el envío (aviso **ámbar**, solo texto, sin link) si:
  1. **Ya existe un trabajador con ese RUT — activo O finiquitado.** Texto acordado: "Ya existe un
     trabajador con este RUT (NOMBRE). Revisa si hay un error en la digitación; si el RUT es correcto,
     contacta a administración vía WhatsApp." Si está finiquitado, la oficina lo **reactiva** desde
     Trabajadores en lugar de crear otro (el backend agrega ", finiquitado" al nombre en su 409).
  2. **Ya hay una solicitud `pendiente` con ese RUT** ("Ya hay una solicitud de ingreso pendiente para
     este RUT."). Las rechazadas/aprobadas no bloquean.
- Comparación por `trabajadores.rut_normalized` (columna generada + índice, mig 053; collation
  `_ci` → la K del DV puede ir en mayúscula o minúscula) y por el RUT limpio de las solicitudes
  pendientes. Con RUT incompleto el check responde "no existe" (no molesta mientras se tipea).
- El backend **re-valida** siempre: en `POST /` (RUT inválido por DV → 400; duplicado → 409) y de
  nuevo **dentro de la transacción de aprobar** (pudo crearse por WorkerForm entre la solicitud y la
  aprobación → 409; y si dos aprobaciones pierden la carrera contra `UNIQUE(rut)`, el `ER_DUP_ENTRY`
  se traduce a un 409 de dominio, no al genérico).
- `check-rut` **no** filtra `es_prueba`: un duplicado es duplicado aunque el trabajador sea de prueba.

### Aprobación (transacción) y rechazo

- `aprobar(id, ficha, userId)`: `getConnection` + `beginTransaction` + `SELECT ... FOR UPDATE` +
  guard `pendiente` (409) + RUT único (409) + `SELECT es_prueba FROM obras` (hereda el flag igual que
  el `beforeCreate` del CRUD) + `INSERT trabajadores` (`activo = 1`, `rut` con `formatRut`,
  `empresa_id`, `categoria_reporte`) + `UPDATE solicitudes_ingreso SET <ficha final>, empresa_id,
  estado='aprobada', trabajador_id, resuelto_por, fecha_resolucion=NOW()` + commit (rollback +
  release en cualquier error). Devuelve `{ solicitud, trabajador_id }`. La solicitud guarda la ficha
  **tal como la aprobó la oficina**, no la original de terreno.
- `rechazar(id, motivo, userId)`: motivo obligatorio (400 si falta o viene en blanco), misma
  transacción con guard `pendiente` (409); `estado='rechazada'`, `motivo_rechazo`, `resuelto_por`,
  `fecha_resolucion`.
- Auditoría en `logs_actividad`: el `activityLogger` registra los `PUT` bajo el módulo
  `solicitudes-ingreso` (clave del path) y, además, la aprobación deja un `logManualActivity`
  bajo `solicitudes_ingreso` con `evento: 'solicitud_aprobada'` y el `trabajador_id` creado → una
  aprobación aparece **dos veces** en el Historial (ambas con etiqueta legible: el resolver
  `SOLICITUD_INGRESO_RESOLVER` de `log-config.js` está registrado bajo las dos claves; label
  "nombres apellido (rut)"). Campos nuevos con rótulo en `LABEL_MAP`.

### Después de aprobar (plan Gestiones B5 — 2026-09-14)

- El modal **no se cierra** al aprobar: `RevisarSolicitudModal` desmonta el formulario (suelta el aviso de
  "cambios sin guardar") y muestra **Trabajador creado** con dos botones, cada uno con SU permiso —
  aprobar no implica ninguno de los dos: **Descargar ficha (Word)** [`documentos.laborales.descargar`]
  (`GET /solicitudes-ingreso/:id/doc`, que emite la ficha si la emisión post-commit falló) y **Emitir kit
  de ingreso** [`documentos.laborales.emitir`], que abre `EmitirKitModal` con el trabajador armado desde
  la solicitud **aprobada** (`workerDesdeSolicitud`: las claves personales van presentes aunque sean null,
  así el modal no vuelve a pedir la ficha —que exigiría `trabajadores.ver`— y detecta solo lo que falta
  para el contrato). El padre (`SolicitudesIngresoPanel.onAprobado`) refresca lista, badge y grilla al
  instante; "Cerrar" solo cierra. El kit también se puede emitir después desde la ficha.
- La respuesta del PUT (`{ solicitud, trabajador_id, solicitud_documento_id }`) ahora sí se usa en el
  front (`AprobacionResultado` en `solicitudIngresoSchema.ts`); antes se descartaba.

### Aislamiento de datos de prueba

`GET /` y `GET /pendientes/count` **excluyen** las solicitudes cuya obra tiene `es_prueba = 1`
(predicado NULL-safe: una solicitud sin obra por `ON DELETE SET NULL` sigue visible) salvo
`?incluir_prueba=true` — misma regla que el CRUD de trabajadores en Consultas
(`docs/reglas/obras-bodegas.md`). Consecuencia en QA: una solicitud hecha sobre una obra de prueba
**no** aparece en la lista ni en el badge sin el flag. `check-rut` no filtra (ver arriba).

### Tabla `solicitudes_ingreso` (mig 108)

- `id`, `estado ENUM('pendiente','aprobada','rechazada') NOT NULL DEFAULT 'pendiente'`.
- Ficha: `rut VARCHAR(12) NOT NULL` (con `formatRut`, **no UNIQUE**), `nombres VARCHAR(100) NOT NULL`,
  `apellido_paterno VARCHAR(100) NOT NULL`, `apellido_materno VARCHAR(100)`, `cargo_id`, `obra_id`,
  `empresa_id` (la pone la oficina), `fecha_ingreso DATE NOT NULL`, `fecha_nacimiento DATE`,
  `estado_civil VARCHAR(30)`, `direccion VARCHAR(255)`, `comuna VARCHAR(100)`, `afp VARCHAR(60)`,
  `salud VARCHAR(60)`, `nacionalidad VARCHAR(60)`, `telefono VARCHAR(20)`,
  `cargas_familiares TINYINT UNSIGNED`, `observaciones TEXT`.
- Auditoría: `solicitante_id INT NOT NULL`, `fecha_solicitud DATETIME DEFAULT CURRENT_TIMESTAMP`,
  `resuelto_por INT NULL`, `fecha_resolucion DATETIME NULL`, `motivo_rechazo TEXT NULL`,
  `trabajador_id INT NULL` (el creado al aprobar), `created_at`, `updated_at`.
- Índices: `estado`, `solicitante_id`, `rut`. FKs dentro del `CREATE` (idempotente): cargo / obra /
  empresa / trabajador `ON DELETE SET NULL` (depurar o borrar no debe fallar por la solicitud
  histórica); `solicitante_id` y `resuelto_por` → `usuarios` (restrictivas).
- Listados con `LEFT JOIN`: cada fila trae `cargo_nombre`, `obra_nombre`, `empresa_nombre`,
  `solicitante_nombre`, `resuelto_por_nombre`.

### API `/api/solicitudes-ingreso` (`routes/solicitudes-ingreso.routes.js`, montada con `safeRoute`)

| Ruta | Gate | Respuesta / errores |
|---|---|---|
| `GET /check-rut/:rut` | crear | `{ data: { existe_trabajador, trabajador, solicitud_pendiente } }` |
| `POST /` | crear + `validateBody(crear)` | 201 `{ data: solicitud }`; 400 RUT inválido / faltan ○; 409 RUT en trabajadores (activo o finiquitado) o solicitud pendiente |
| `GET /?estado=pendiente\|aprobada\|rechazada\|todas` | crear **o** aprobar | `{ data: solicitud[] }` (default `todas`; 400 estado inválido; solo propias sin aprobar; `?incluir_prueba=true`) |
| `GET /pendientes/count` | aprobar | `{ data: { total } }` (badge; excluye `es_prueba`) |
| `GET /:id` | crear **o** aprobar | `{ data: solicitud }`; 404; 403 si es ajena y no aprueba |
| `PUT /:id/aprobar` | aprobar + `validateBody(aprobar)` | body = ficha completa + `empresa_id` (400 si falta) + `categoria_reporte?` → `{ data: { solicitud, trabajador_id } }`; 409 no pendiente / RUT duplicado |
| `PUT /:id/rechazar` | aprobar + `validateBody(rechazar)` | body `{ motivo }` (400 vacío/blank) → `{ data: solicitud }`; 409 no pendiente |

Las rutas de dos segmentos fijos (`/check-rut/:rut`, `/pendientes/count`) van declaradas **antes**
de `/:id`. Errores con el patrón del repo: `throw Object.assign(new Error(msg), { statusCode })`.

### Archivos

- Backend: `db/migrations/108_solicitudes_ingreso.sql`, `schemas/solicitudesIngreso.schema.js`,
  `services/solicitudIngreso.service.js`, `routes/solicitudes-ingreso.routes.js`, `index.js`
  (`safeRoute` + `allowedFields`), `config/permisos.config.js`, `config/log-config.js`,
  `services/crud.service.js` (blindaje).
- Frontend: `types/entities.ts` (`SolicitudIngreso`, `SolicitudIngresoEstado`, `Trabajador` + 8),
  `hooks/useSolicitudesIngreso.ts`, `components/consultas/{solicitudIngresoSchema.ts,
  SolicitudIngresoForm.tsx, SolicitudesIngresoPanel.tsx, RevisarSolicitudModal.tsx, CreatePanel.tsx}`,
  `components/workers/{DatosPersonalesFields.tsx, WorkerForm.tsx, WorkerQuickView.tsx}`,
  `components/layout/Sidebar.tsx`, `pages/Consultas.tsx`, `pages/Dashboard.tsx` +
  `dashboard/widgets/BandejaDelDia.tsx`, `utils/statusConfig.ts`, `config/permisosHierarchy.ts`.
- **Efectos al aprobar (revisión adversarial 2026-09-08)**: en la misma transacción, otras
  solicitudes PENDIENTES con el mismo RUT quedan `rechazada` con motivo
  "Trabajador ya creado desde la solicitud #N" (evita dos trabajadores por carrera).
- **Permisos de catálogos**: los selects del formulario piden `/obras`, `/cargos` (y `/empresas`
  en la revisión) → el rol de terreno necesita además `obras.ver` + `cargos.ver`; el de oficina
  `empresas.ver` + `obras.ver` + `cargos.ver`. Sin ellos la UI lo avisa explícitamente.
  Follow-up: endpoint `/solicitudes-ingreso/catalogos` gateado por los permisos propios.
- Lista y badge consultan con `incluir_prueba=true` (paridad con la grilla de Consultas).

## Sueldo por cargo (plan Gestiones B3, mig 111 — 2026-09-11)

- Decisión del dueño: los parámetros de sueldo viven **solo por cargo** (sin monto propio por
  trabajador) y **se imprimen en el contrato** (B5 congela en la metadata del documento el valor
  vigente al emitir). Parámetros: `sueldo_base`, `bono_colacion`, `bono_movilizacion` (CLP enteros,
  `INT UNSIGNED`: el pool no usa `decimalNumbers`), `observaciones`.
- Tabla **`cargo_sueldos`** 1:1 con `cargos` (FK `ON DELETE RESTRICT`: el "reciclaje" de cargos del
  CRUD genérico ya no puede borrar el historial → 409 vía `ER_ROW_IS_REFERENCED_2`). Los montos
  NUNCA salen por `/api/cargos` (lo consume terreno con `cargos.ver`).
- **`cargo_sueldos_historial`** append-only: una fila por cada cambio de algún monto (quién, cuándo).
  Editar solo observaciones no genera historial.
- API `/api/cargo-sueldos` (`routes/cargo-sueldos.routes.js`, `services/cargoSueldo.service.js`):
  `GET /` [`cargos.sueldo.ver`] lista cargos activos con `sueldo` (o `null`); `GET /:cargoId`,
  `GET /:cargoId/historial` [ver]; `PUT /:cargoId` [`cargos.sueldo.editar` + `validateBody` strip]
  → transacción `FOR UPDATE` (404 si el cargo no existe) + `INSERT … ON DUPLICATE KEY UPDATE` +
  historial si cambió un monto. Gates **exclusivos** (sin OR con `cargos.editar`). Degradación:
  con la mig 111 pendiente (errno 1146) `GET /` devuelve los cargos con `sueldo: null`.
- Permisos `cargos.sueldo.ver` / `cargos.sueldo.editar` (módulo **Cargos**, `sensible: 'financiero'`
  solo en `permisosHierarchy.ts`; NO en `PERMISOS_FINANCIEROS`). La migración los crea y los da solo
  al Super Administrador; **el dueño asigna a RRHH a mano** (Configuración → Roles + re-login).
- Historial de Actividad: el logger global excluye `/api/cargo-sueldos` (el body trae montos); el
  service registra un log manual `sueldo_cargo_actualizado` con cargo y `cambio_montos`, **sin cifras**;
  `sueldo_base`/`bono_*` están en `EXCLUDED_KEYS`.
- UI: Configuración → Cargos muestra la columna "Sueldo base" y el icono Banknote (solo con `.ver`);
  `CargoSueldoModal` (3 `CurrencyInput`, total mensual, historial colapsable; solo lectura sin `.editar`).
  Lógica pura en `cargoSueldoSchema.ts` (+ test).
- Tests: `backend/tests/cargo_sueldos.test.js` (403 exclusivos, 400 de forma, 404, historial condicional,
  rollback, log sin montos, fallback 1146, `/api/cargos` sin sueldo).

## Desvinculación con causal e historial (plan Gestiones B4, mig 112 — 2026-09-11)

- **Req. 7 del dueño**: la desvinculación exige **causal obligatoria** (catálogo cerrado en
  `backend/src/config/causalesDesvinculacion.js`: art. 159/160/161 del Código del Trabajo + operativas
  LOLS; `LEGADO` = bajas anteriores, no seleccionable), `detalle` obligatorio para art. 160,
  NO_PRESENTACION, RENDIMIENTO y OTRO, y una marca **`no_recontratar`** (precargada según la causal).
  Decisión del dueño 2026-09-10: la marca **solo advierte** (reactivar y la solicitud de ingreso muestran
  causal/fecha; nadie queda bloqueado).
- **Endpoints dedicados** (`routes/trabajadores.routes.js`, `services/desvinculacion.service.js`):
  `PUT /:id/desvincular` [`trabajadores.eliminar`] `{fecha_desvinculacion, causal_codigo, detalle?, no_recontratar?}`
  → transacción `FOR UPDATE` (404 / 409 `YA_DESVINCULADO` / 400 fecha < ingreso o > hoy+30 / 400 causal
  sin detalle) → INSERT en `trabajador_desvinculaciones` (con `fecha_ingreso_periodo`) → UPDATE
  `trabajadores` (`activo=0`, `fecha_desvinculacion`, `causal_desvinculacion`, `no_recontratar`) → cuenta
  asistencias posteriores (se informan, no se tocan). `PUT /:id/reactivar` [`trabajadores.reactivar`]
  `{quitar_marca_no_recontratar?}` → 409 `YA_ACTIVO`; `activo=1`, limpia fecha/causal, **conserva
  `fecha_ingreso`** (7 validaciones dependen de ella) y la marca salvo pedido; cierra la fila del historial
  (`reactivado_por/en`). `GET /:id/desvinculaciones` [eliminar OR reactivar] = historial con `detalle`.
  `GET /catalogos/causales-desvinculacion` [auth] = catálogo (2 segmentos: el CRUD captura `/:id`).
- **Gates reales**: hasta hoy `trabajadores.eliminar`/`.reactivar` solo se exigían en la UI y cualquiera con
  `trabajadores.editar` desvinculaba con `PUT /:id {activo:false}`. Ahora `index.js` monta un guard ANTES
  del CRUD: `PUT /:id` descarta `activo`/`fecha_desvinculacion` (ya no están en `allowedFields`) y responde
  400 "recarga la página" si el body solo traía eso; `DELETE /:id` → 405.
- **Visibilidad** (`desvinculacionService.modoSegunPermisos`): `detalle` es antecedente interno → solo
  con `trabajadores.eliminar` o `.reactivar` (`/desvinculaciones` y, desde 2026-09-11 por decisión del
  dueño, también los avisos de ambos check-rut: "Motivo registrado: …"); con `trabajadores.ver` (y siempre
  en el check-rut de oficina, gate `trabajadores.crear`) modo `resumen` = causal/fecha/marca sin detalle;
  el check-rut de solicitudes para terreno solo fecha, artículo y marca. El quick-view para `asistencia.ver`
  no proyecta `causal_desvinculacion`/`no_recontratar` (allow-list de B1).
- **Reporte semanal**: las bajas salen de `trabajador_desvinculaciones` (con columna Causal) con fallback a
  `trabajadores.fecha_desvinculacion` si la mig 112 no corrió → reactivar ya no borra la baja del KPI.
- **Depurar** (`DELETE /:id/depurar`): 409 si hay finiquito emitido o documentos generados por Bóveda.
- **Finiquito (B5)**: la pantalla de éxito de `DesvincularModal` ofrece **Emitir finiquito** (gate
  `documentos.laborales.emitir`) con la baja recién registrada en mano; también desde la ficha del
  trabajador desvinculado. La fila del historial guarda `finiquito_documento_id` (el último emitido es el
  vigente) y `DesvinculacionInfo` muestra "Finiquito emitido". Ver § Finiquito y contrato al aprobar.
- **El antecedente sobrevive a la depuración (mig 113, decisión del dueño tras QA 2026-09-11)**: el
  historial guarda `rut_normalized` + `nombre_snapshot` y la FK a trabajadores es `ON DELETE SET NULL`
  (`trabajador_id = NULL` = ficha depurada). Ambos check-rut consultan `antecedentePorRut` cuando el RUT
  no tiene ficha → "RUT disponible, pero…" con fecha/causal/marca (`trabajador_depurado: true`). Sigue
  siendo solo un aviso. Terreno (solicitud) ve fecha/artículo/marca; con `trabajadores.ver` también el
  nombre de la causal (`checkRut(rut, { conCausal })`).
- **UI**: `DesvincularModal` (fecha, causal, detalle, marca; éxito con causal y aviso de asistencias
  posteriores), `ReactivarModal` (última desvinculación + tarjeta roja si marcado + checkbox quitar marca),
  `DesvinculacionInfo` en la ficha rápida, aviso en el check-rut de `WorkerForm`. Lógica pura en
  `desvinculacionSchema.ts` (+ test). Logs: `trabajador_desvinculado` / `trabajador_reactivado` sin `detalle`.
- Pendiente (§10.4 del plan): qué hacer con asistencias registradas después de la fecha de baja.

## Documentos laborales generados por Bóveda (plan Gestiones B2, mig 110 — 2026-09-11)

Requerimientos 2, 8 y 10 de RRHH: los documentos del ingreso los **emite el sistema**, quedan en la
ficha del trabajador y su descarga o impresión es "solo oficina".

- **Formato**: Word **editable**. Un `.doc` es HTML con cabecera MS Office — no hay conversión ni
  librería nueva. `services/docGenerador.service.js` arma el HTML (`wrapHtml`, `encabezado`,
  `bloqueFirmas`, `fmtCLP`, `fechaLarga`, `sinPuntoFinal`) y el buffer **con BOM UTF-8** (sin BOM Word
  rompe los acentos). El endpoint de impresión devuelve el mismo HTML **sin BOM** (con BOM el iframe
  del navegador cae en quirks mode). Logo: `backend/assets/logo-lols-wordmark.png` (450×198, se imprime
  a 150×66) embebido como data URI; el `logo-lols-green.png` es el isotipo cuadrado y deformaría el
  encabezado. La generación en el navegador (`utils/downloadWord.ts`, `ConstanciaModal.tsx`) se eliminó;
  queda `utils/printHtml.ts` solo para imprimir lo que manda el servidor.
- **Plantillas** (`backend/src/plantillas/documentos/`, mapa blanco `codigo → plantilla`): cada una
  expone `codigo, version, titulo, requiere(ctx), nombreBase(ctx), build(ctx), metadata(ctx)`. Los textos
  legales son DATO: RRHH los corrige ahí sin tocar lógica. Kit de ingreso = `CONTRATO`, `ODI_D40`,
  `DAS`, `PTS_ALTURA`, `EPP_RECEPCION`, `RI_RECEPCION`; sueltos: `AMONESTACION`, `SOLICITUD_INGRESO` y
  `FINIQUITO` (B5, ver sección propia). `requiere()` devuelve la lista de datos faltantes → 409 `DATOS_FALTANTES`
  **antes** de escribir nada (un kit nunca queda a medias).
- **Contrato**: plazo fijo con días editables (default 15), jornada, gratificación 25% con tope 4,75 IMM
  y pago el día 05 como texto fijo; el **sueldo base se imprime en cifras y en letras**
  (`utils/numeroALetras.js`) tomado de `cargo_sueldos` (mig 111) y queda congelado en `metadata`.
  Sin representante legal de la empresa o sin sueldo del cargo → 409 con el dato que falta.
- **Datos personales del trabajador: obligatorios para el contrato (B2b, tras QA del dueño 2026-09-11)**.
  Antes, un trabajador con la ficha incompleta producía un contrato con **líneas de guiones** en
  nacionalidad, estado civil, fecha de nacimiento y domicilio, y el hueco aparecía recién en el papel
  firmado. Ahora `contrato.plantilla.requiere()` los exige (dirección y comuna **por separado**: con una
  sola de las dos la cláusula imprimía medio domicilio) y el 409 `DATOS_FALTANTES` trae, además de la
  lista legible, `campos_trabajador` con las claves de columna.
  **El modal los pide ahí mismo**: `EmitirKitModal` muestra una caja ámbar con solo los campos que
  faltan, hace `PUT /trabajadores/:id` con **únicamente lo completado** y recién entonces emite —
  guardar primero, emitir después, para que nunca salga un contrato con datos que no quedaron en la
  ficha. ⚠️ El payload **jamás** lleva `null`: el CRUD genérico descarta `undefined` pero conserva
  `null`, así que un null borraría datos existentes (por eso este flujo NO usa `normalizarDatosPersonales`,
  que sí los emite porque `WorkerForm` precarga la ficha completa). Sin `trabajadores.editar` la caja
  sale en solo lectura y el contrato queda bloqueado; el resto del kit se emite igual.
  El resto de las plantillas del kit (ODI, DAS, PTS altura, EPP, Reglamento Interno) **no** heredan el
  requisito: no imprimen esos datos. La ficha rápida avisa los que faltan antes de llegar a emitir.
- **La restricción vive en el TIPO**: `tipos_documento.codigo` (clave estable) + `restringido`. Un
  contrato **escaneado** subido a un tipo restringido queda bajo el mismo gate. Los tipos del sistema
  se crean con nombre "(Bóveda)" y `obligatorio = 0` (no alteran la completitud); no se pueden desactivar,
  volver obligatorios ni eliminar desde Configuración (409 `TIPO_SISTEMA`), solo renombrar.
- **Estados** (`documentos.estado`): `subido|generado → descargado → en_terreno → firmado` (B6, mig 114;
  `entregado` de la mig 110 quedó sin uso). Excepción a "monótono": un documento devuelto sin firma o que el
  portador no recibió vuelve a `descargado`. `fecha_descarga` guarda la PRIMERA descarga; **las alertas de B7
  cuentan desde `fecha_generacion`**, así re-descargar no silencia el aviso.
- **Permisos** (creados por la mig 110; el dueño los asigna a mano en Configuración → Roles + re-login):
  `documentos.laborales.emitir` y `documentos.laborales.descargar`, ambos **exclusivos** (sin patrón OR).
  `documentos.descargar` NO alcanza para un documento restringido: `GET /documentos/download/:id`
  responde 403 `{error, required:['documentos.laborales.descargar']}`.
- **Los dos empaquetadores excluyen siempre los restringidos**: el ZIP de la ficha
  (`/documentos/download-all/:tid`, con header `X-Documentos-Omitidos: N`) y el ZIP que
  `POST /fiscalizacion/enviar-excel` adjunta **por correo** (el cuerpo del correo indica cuántos se
  omitieron). Sin esto, un permiso de reportes sacaría contratos de la empresa por email.
- **`metadata` (snapshot con la remuneración) nunca sale por `documentos.ver`**: `getByTrabajador` y
  `getVencidos` usan proyección explícita de columnas (nada de `d.*`) y `metadata` está en
  `EXCLUDED_KEYS` del historial. Los logs de emisión/descarga son manuales y no llevan montos.
- **API** (`/api/documentos-laborales`, `safeRoute`):
  `GET /catalogo` (auth) · `GET /trabajador/:id` [documentos.ver] · `POST /emitir/:tid` y
  `POST /kit-ingreso/:tid` [laborales.emitir] · `GET /:id/download` y `GET /:id/html` [laborales.descargar].
  `GET /solicitudes-ingreso/:id/doc` [laborales.descargar]: solicitud **pendiente** → `.doc` al vuelo sin
  persistir; **aprobada** → el documento guardado en la ficha del trabajador (se emite si faltara).
  Al aprobar una solicitud la ficha se emite sola **post-commit**: si falla, se registra un `warn` y la
  aprobación igual se completa (`solicitud_documento_id` en la respuesta).
- **Subida de Word**: `upload.js` acepta `.doc/.docx` y `pdf.service.processFile` los guarda sin convertir
  (no hay Office en cPanel). Flujo real: emitir → editar en Word → firmar → subir el escaneado o el
  `.docx` al mismo tipo restringido; la versión emitida queda como evidencia de lo que generó el sistema.
  Todos los nombres de archivo llevan sufijo `-HHmmss`: dos subidas del mismo trabajador el mismo día
  ya no se pisan (bug latente que existía desde la mig 002).
- **Degradación (D-I)**: si la mig 110 no corrió, cada lectura cae a la consulta legacy por errno 1054
  (`getByTrabajador`, `getFilePath`, `marcarDescargado`, `zip.service`, tipos del sistema, empresas sin
  representante). Emitir responde 409 `MIGRACION_PENDIENTE` en vez de un 500.
- **UI**: `components/documents/` — `EmitirKitModal` (casillas por documento, fecha, días de plazo,
  implementos de EPP, duración de la charla), `EmitirAmonestacionModal` (sucesor de `ConstanciaModal`),
  `DocumentosGeneradosList` (en la ficha rápida, con estado y Descargar/Imprimir gateados) y la lógica
  pura de `documentosLaborales.ts` (+ test). `utils/descargarArchivo.ts` centraliza la descarga: lee el
  403 que viene como Blob y lo muestra con el nombre del permiso que falta (antes el GET fallaba mudo).
  La lista de "Documentos Subidos" filtra `origen === 'subido'` y la completitud cuenta **tipos
  obligatorios distintos** (`contarObligatorios`), así el kit generado no la infla.

## Finiquito y contrato al aprobar (plan Gestiones B5 — 2026-09-14, sin migración)

Requerimientos 3 y 6 de RRHH. Reusa las migraciones 110 (tipo `FINIQUITO`, restringido), 111 y 112
(`trabajador_desvinculaciones.finiquito_documento_id`). El **contrato** ya se emite dentro del kit de
ingreso (B2); B5 agrega el CTA tras aprobar (ver § Solicitudes → Después de aprobar) y el **finiquito**.

- **Plantilla** `backend/src/plantillas/documentos/finiquito.plantilla.js` (`FINIQUITO` v1.0, "Finiquito de
  Trabajador"), portada del molde en papel de LOLS/MAUA: comparecencia, cláusulas PRIMERO a CUARTO, cuadro
  de haberes con **total en cifras y en letras**, cierre en **dos** ejemplares, declaración jurada **Ley
  21.389** (retención judicial) y firmas empleador / trabajador (sin huella ni "recibí copia"). Texto legal =
  DATO reemplazable. Registrada en `EMITIBLES` (nunca en `KIT_INGRESO`).
- **Solo a desvinculados con baja vigente**: es el ÚNICO documento que exige `activo = 0`
  (`emitir()` ramifica el guard: activo → 409 `TRABAJADOR_ACTIVO`; el kit y la amonestación siguen
  rechazando al desvinculado). `ctx.desvinculacion` sale de `desvinculacionService.desvinculacionAbierta`
  = la fila con `reactivado_en IS NULL` (**no** `ultimaDesvinculacion`, que devuelve también bajas ya
  cerradas por una reactivación). Sin fila abierta → 409 `DATOS_FALTANTES` "baja vigente registrada en el
  historial" (no manda a Desvincular: respondería `YA_DESVINCULADO`). Mig 112 pendiente (1146/1054) → 409
  `MIGRACION_PENDIENTE` "Avisa a TI", distinguido a propósito del caso anterior (`estricta: true`).
- **RRHH digita los montos; el sistema NO calcula** (v1, decisión §2b del plan): `haberes[]` (1..10 líneas
  `{concepto, monto}`, CLP entero ≥ 0), `descuentos[]` opcional (≤ 10), total = haberes − descuentos
  (409 si negativo **o si la suma de haberes es 0**: el estado inicial del modal no es un finiquito); el
  total se imprime con `fmtCLP` y `montoEnLetras` **una sola vez** (el molde traía "Son:( pesos)" y habría
  impreso "pesos pesos"). Los montos se aceptan solo como número o string de dígitos (`Number(true)` y
  `Number('')` colarían 1 y 0). Ni indemnizaciones ni feriado proporcional: se agregan como líneas a mano.
  `fecha_finiquito` (default hoy) debe ser ≥ fecha de la baja — se valida el valor **efectivo** que imprime
  `build()`, default incluido, y el calendario real (no basta la forma AAAA-MM-DD); `lugar_firma` default
  "Santiago".
- **La causal impresa siempre tiene artículo**: se imprime `articulo_texto` del catálogo ("Artículo 159, N°
  4 del Código del Trabajo"). Si la baja se registró con una causal **operativa LOLS o LEGADO** (sin
  artículo), quien emite elige la causal legal en el modal (`causal_codigo`, solo del catálogo y con
  artículo). Si la baja **ya tiene** causal legal, manda ella: un `causal_codigo` distinto responde 409
  ("causal coherente con la baja") — el backend lo exige, no solo la UI. La registrada **no se pisa** nunca:
  `metadata.desvinculacion` guarda `causal_registrada` y `causal_impresa`. El `detalle` interno de la
  baja no se imprime ni entra en metadata.
- **Enlace con la baja**: tras persistir, `vincularFiniquito(desvinculacion_id, documento_id)` estampa
  `finiquito_documento_id` con `WHERE id = ? AND reactivado_en IS NULL` (si otro usuario reactivó al
  trabajador entre la lectura y el UPDATE, la fila ya cerrada no recibe el enlace). El **último** emitido es
  el vigente; una reemisión reemplaza el enlace y el documento anterior sigue en la ficha. Si el enlace falla
  (fila cerrada/borrada, 1146, error de BD) el documento **ya existe**: se registra un `warn` y la respuesta
  trae `enlazado: false` — un 500 acá haría reemitir un finiquito que sí quedó guardado. **La UI lo muestra**
  (`avisoEnlaceFiniquito`: caja ámbar + toast de advertencia en el modal y en el éxito de Desvincular) porque
  sin enlace la ficha seguiría ofreciendo "Finiquito" en vez de "Reemitir" y RRHH emitiría otro. Con el
  enlace, `DELETE /:id/depurar` responde 409 `TIENE_FINIQUITO`.
- **API**: el mismo `POST /documentos-laborales/emitir/:tid` [`documentos.laborales.emitir`] con
  `{ codigo: 'FINIQUITO', fecha_finiquito?, lugar_firma?, haberes, descuentos?, causal_codigo? }`
  (`validateBody` con `itemRules` por línea). Respuesta 201 `{ documento_id, nombre_archivo, tipo_codigo,
  estado, desvinculacion_id, enlazado }`. Descarga/impresión por las rutas gateadas de B2; `metadata` lleva
  montos → nunca sale por `documentos.ver`. Log manual `documento_emitido` **sin montos**.
- **UI**: `components/documents/EmitirFiniquitoModal.tsx` (baja de la ficha o del resultado de desvincular;
  si no la tiene la pide a `GET /trabajadores/:id/resumen`; líneas con `CurrencyInput`; total en vivo;
  selector de causal legal solo cuando la registrada no tiene artículo; aviso si ya había finiquito
  emitido; bloqueado si el trabajador está activo o no tiene baja). Se abre desde el éxito de
  `DesvincularModal` y desde `DocumentosGeneradosList` (botón **Finiquito** / **Reemitir finiquito**,
  visible solo con el trabajador desvinculado — condición inversa a Emitir kit / Amonestación). Cuando el
  modal debe leer la baja del resumen (`trabajadores.ver`) y recibe 403, lo dice (no "sin baja"). Lógica
  pura en `documentosLaborales.ts` (`conceptoDiasTrabajados`, `lineasValidas`, `totalFiniquito`,
  `validarFiniquito`, `buildFiniquitoPayload`, `workerDesdeSolicitud`, `avisoEnlaceFiniquito`) y
  `desvinculacionSchema.ts` (`bajaDesdeResultado`) + tests.
- **Modales anidados** (kit dentro de la revisión de solicitud; finiquito dentro de desvincular): `ui/Modal`
  lleva una pila de modales abiertos y **Escape cierra solo el de más arriba** — antes cada modal escuchaba
  `keydown` y una sola tecla cerraba los dos (y desmontaba la pantalla de éxito del padre).
- **Pendiente (§10.3 del plan)**: si RRHH quiere que el sistema calcule vacaciones proporcionales e
  indemnizaciones, es un bloque aparte con vigencia histórica de sueldos.

## Cadena de custodia de documentos físicos (plan Gestiones B6, mig 114 — 2026-09-14)

Requerimiento 9 de RRHH, **rediseñado con el dueño tras el QA de B5**. El flujo real no es "entregar un
documento al trabajador" sino una cadena de custodia con dos traspasos, ambos en la oficina central:
RRHH (Matías) imprime → el **portador** autorizado (Jhoan Vásquez / Héctor Gómez) retira → el trabajador
firma en la obra (papel) → el portador devuelve los firmados → RRHH recibe.

- **Decisiones del dueño (2026-09-14)**: (1) RRHH declara en Bóveda qué entrega → el portador **confirma en
  Bóveda** que lo recibió → al volver firmados RRHH **confirma la recepción**; (2) "listo para retirar" =
  documento ya **descargado/impreso** (`estado = descargado`), sin paso "impreso" aparte; (3) entran **todos
  los generados** por Bóveda; (4) constancia = **solo el registro** (sin firma digital ni acta); (5) la copia
  firmada se **marca** recibida, no se sube; (6) **doble llave estricta**: RRHH no puede confirmar el retiro
  por el portador (si se le olvida, el lote queda pendiente y B7 lo persigue); (7) sin guía de retiro en Word.
- **El LOTE es la unidad** (`documentos_lotes` + `documentos_lotes_items`): RRHH no registra documento por
  documento. Un lote = lo que imprimió hoy para un portador. Estados del lote: `pendiente_retiro` →
  `en_terreno` (el portador confirmó) → `cerrado` (nada queda en terreno). Ítem: `pendiente` → `retirado` →
  `firmado` | `devuelto_sin_firma`; `no_entregado` si el portador lo desmarcó al confirmar. Los dos últimos
  liberan el documento (`lote_id = NULL`, vuelve a `descargado`) para llevarlo de nuevo. Un documento está
  en **un solo lote abierto** a la vez (`documentos.lote_id`; FOR UPDATE al crear → 409
  `DOCUMENTO_NO_DISPONIBLE` con la lista si otro RRHH se adelantó).
- **Permisos**: `documentos.entrega.registrar` (RRHH: `GET /portadores`, `GET /disponibles`, `POST /`,
  `PUT /:id/recepcion`, `DELETE /:id` anular solo `pendiente_retiro`) y **`documentos.entrega.portar`**
  (portador: `GET /` y `GET /:id` **solo sus lotes**, `PUT /:id/confirmar-retiro` solo si el lote es suyo →
  403 `LOTE_AJENO`). Ambos se CREAN en la mig 114 (catálogo + rol 1 + bump); el dueño asigna: registrar a
  RRHH en Roles; portar por **override de usuario** a Jhoan y Héctor (Config → Usuarios), como Héctor con
  aprobar. `GET /portadores` calcula el permiso efectivo en SQL (rol o grant, sin deny; rol 1 siempre).
- **API** `/api/documentos-lotes` (`safeRoute`; segmentos literales antes de `/:id`). `POST /`
  `{portador_id, documento_ids[], observacion?}` → 201 `{lote_id, portador_id, portador_nombre, n}`; 400
  `PORTADOR_INVALIDO` (inactivo o sin portar). `PUT /:id/confirmar-retiro {documento_ids}` = los que SÍ
  recibió (vacío = ninguno → lote cerrado). `PUT /:id/recepcion {firmados[], sin_firma[]}` parcial: el lote se
  cierra cuando no queda ningún ítem `retirado`; 409 `LOTE_NO_EN_TERRENO` si el portador aún no confirmó.
  `GET /pendientes/count` → `{por_confirmar, en_terreno, alcance: 'todos'|'propios'}` (badge + Bandeja).
  `GET /documentos-laborales/trabajador/:id` agrega `lote_id, lote_estado, lote_retirado_en, portador_nombre,
  fecha_firmado` (consulta aparte condicionada a `hasCols('documentos','lote_id')` para no tocar el fallback
  de la mig 110).
- **Degradación (D-I)**: sin la mig 114 las lecturas devuelven vacío/ceros y las escrituras 409
  `MIGRACION_PENDIENTE`. Logs manuales `lote_creado` / `lote_retirado` / `lote_recepcion` / `lote_anulado`
  con **conteos** (nunca nombres ni RUT de trabajadores); el logger global excluye `/api/documentos-lotes`.
  Depurar un trabajador borra sus ítems (CASCADE); el lote queda como histórico.
- **UI**: Gestiones → pestaña **Documentos físicos** (`?tab=fisicos`; el portador sin `trabajadores.ver` cae
  ahí directo; Gestiones es visible para él en el menú). `DocumentosFisicosPanel` (lista de lotes con estado,
  portador, resumen y días en terreno) · `NuevoLoteModal` (documentos impresos agrupados **obra → trabajador**
  con casilla por trabajador —un kit de 6 = 1 clic—, buscador, filtro por obra, portador recordado en
  `localStorage`) · `LoteDetalleModal` (portador + por confirmar: casillas pre-marcadas y **"Recibí estos
  documentos"**, pensado para el celular; RRHH + en terreno: por documento Firmado / Sin firma / Sigue en
  terreno con todo pre-marcado como firmado; RRHH + por confirmar: anular). Badge ámbar en el botón y grupo
  "Documentos físicos" en la Bandeja del Día (`useLotesPendientes`, store de módulo). La ficha del trabajador
  muestra "En terreno · con Jhoan desde …" y "Firmado …" en la lista de generados (`statusConfig` gana
  `en_terreno` y `firmado`). Lógica pura en `documentos-fisicos/documentosFisicos.ts` (+ test).
- **Velocidad neta**: RRHH 2 acciones por viaje (crear lote / registrar recepción), portador 1 tap, el
  trabajador no toca nada. B7 agrega umbrales: lote sin confirmar > 1 día, documentos en terreno > N días.

## Empresas: representante legal (mig 110)

`empresas.representante_nombre` y `representante_rut` se editan en Configuración → Empresas y se
imprimen en el contrato y el finiquito (en el finiquito, en la declaración jurada de la Ley 21.389). Sin
ellos, emitir un contrato o un finiquito responde 409 con el dato que falta.
En v1 solo LOLS y MAUA emiten (decisión del dueño 2026-09-11).
