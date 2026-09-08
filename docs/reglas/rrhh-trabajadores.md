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

## Fiscalización / Consultas

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

## Constancias

- Plantilla real LOLS: **Carta de Amonestación** (Word, sin IA); botón por fila en Consultas
  (solo-icono con tooltip, fondo blanco glass). El Acta de Consentimiento fue eliminada.

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
  (dato duplicado)"**. Para recontratar a un finiquitado se **reactiva** el existente, no se crea
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
